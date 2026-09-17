import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Requires Playwright and Chromium; PLAYWRIGHT_MODULE / CHROME_PATH can use an existing installation.
// Use --baseline=<pre-fix-ref> to reproduce the bug against an earlier revision.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baselineArg = process.argv.find(arg => arg.startsWith('--baseline='))
const baseline = baselineArg?.slice('--baseline='.length)
const file = 'src/sftp/sftp-floating-panel.component.ts'
const source = baseline
  ? execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' })
  : readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
const component = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'SftpFloatingPanel')
const names = ['_isPanelActive', '_isPanelTyping', 'onTextInputKeyEvent', 'onGlobalKeyDown']
// Run the actual component handlers and decorator bindings without booting SSH or Angular services.
const members = component.members.filter(node => names.includes(node.name?.getText(ast)))
const compiled = ts.transpileModule(`class Panel { ${members.map(node => node.getText(ast)).join('\n')} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
}).outputText

const server = createServer((_, response) => {
  response.setHeader('Content-Type', 'text/html')
  response.end(`<!doctype html><sftp-plus-panel tabindex="-1" style="display:block">
    <textarea id="editor"></textarea><textarea id="viewer" readonly>read only</textarea>
    <input id="path"><div id="rich" contenteditable="true"><span>rich text</span></div>
    <button id="close">Close</button></sftp-plus-panel>
    <div class="xterm"><textarea id="terminal"></textarea></div><input id="outside">`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  })
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.evaluate(code => {
    window.keyEvents = []
    window.terminalPastes = 0
    window.editorChanges = 0
    // Register the terminal listener FIRST, as Tabby does before opening an SFTP panel.
    for (const type of ['keydown', 'keyup']) {
      document.addEventListener(type, event => {
        window.keyEvents.push({ type, key: event.key })
        if (type === 'keydown' && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
          window.terminalPastes++
        }
      })
    }
    document.querySelector('#editor').addEventListener('input', () => window.editorChanges++)
    const bindings = []
    const HostListener = name => (_, method) => { bindings.push({ name, method }) }
    const os = { platform: () => navigator.platform.includes('Mac') ? 'darwin' : 'linux' }
    const Panel = new Function('HostListener', 'os', `${code}; return Panel`)(HostListener, os)
    const panel = new Panel()
    const root = document.querySelector('sftp-plus-panel')
    panel.elRef = { nativeElement: root }
    panel.editorVisible = true
    panel.closeEditor = () => { window.editorClosed = true }
    panel.ctxClipboardPaste = () => {}
    panel._resolveTargetPane = () => 'local'
    panel._panelHotkeyEnabled = () => false
    window.panel = panel
    const cleanup = []
    for (const { name, method } of bindings) {
      const target = name.startsWith('document:') ? document : root
      const type = name.replace('document:', '')
      const handler = event => panel[method](event)
      target.addEventListener(type, handler)
      cleanup.push(() => target.removeEventListener(type, handler))
    }
    window.removePanelListeners = () => cleanup.forEach(remove => remove())
  }, compiled)

  const editor = page.locator('#editor')
  await page.evaluate(() => navigator.clipboard.writeText('paste-regression'))
  await editor.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+V')
  assert.equal(await editor.inputValue(), 'paste-regression'.repeat(3), 'native paste must occur exactly once per shortcut')
  assert.equal(await page.evaluate(() => window.editorChanges), 3)
  assert.equal(await page.evaluate(() => window.terminalPastes), baseline ? 3 : 0, 'terminal paste must be isolated')
  if (baseline) {
    console.log('PASS: reproduced old behavior: 3 editor pastes also triggered 3 terminal pastes')
  } else {
    assert.deepEqual(await page.evaluate(() => window.keyEvents), [], 'both key phases and modifiers must stay inside the panel')
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('ControlOrMeta+C')
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'paste-regression'.repeat(3))
    await page.keyboard.press('ControlOrMeta+X')
    assert.equal(await editor.inputValue(), '')
    await page.keyboard.press('ControlOrMeta+Z')
    assert.equal(await editor.inputValue(), 'paste-regression'.repeat(3), 'native undo must survive')

    for (const selector of ['#editor', '#viewer', '#path', '#rich span']) {
      const result = await page.locator(selector).evaluate(element => {
        window.keyEvents = []
        const events = [
          new KeyboardEvent('keydown', { key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
          new KeyboardEvent('keyup', { key: 'v', code: 'KeyV', bubbles: true, cancelable: true }),
          new KeyboardEvent('keydown', { key: 'Insert', shiftKey: true, bubbles: true, cancelable: true }),
        ]
        return { allowed: events.map(event => element.dispatchEvent(event)), received: window.keyEvents }
      })
      assert.deepEqual(result, { allowed: [true, true, true], received: [] }, `${selector}: isolate without preventing defaults`)
    }

    await page.locator('#viewer').focus()
    await page.keyboard.press('ControlOrMeta+V')
    assert.equal(await page.locator('#viewer').inputValue(), 'read only')
    assert.equal(await page.evaluate(() => window.terminalPastes), 0)
    await editor.focus()
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'viewer', 'native focus navigation must survive')
    await editor.focus()
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(() => window.editorClosed), true, 'existing Escape handler must run')

    for (const selector of ['#terminal', '#outside']) {
      await page.locator(selector).focus()
      const before = await page.evaluate(() => window.terminalPastes)
      await page.keyboard.press('ControlOrMeta+V')
      assert.equal(await page.evaluate(() => window.terminalPastes), before + 1, 'outside events must reach the host')
    }
    await page.evaluate(() => {
      window.panel.minimized = true
      window.keyEvents = []
      document.querySelector('#editor').dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }))
    })
    assert.equal(await page.evaluate(() => window.keyEvents.length), 1, 'inactive panels must not consume events')
    await page.evaluate(() => window.removePanelListeners())
    console.log('PASS: paste isolation, native copy/cut/undo, readonly, alternate bindings, keyup, contenteditable, Tab, Escape, outside focus and inactive panel')
  }
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
