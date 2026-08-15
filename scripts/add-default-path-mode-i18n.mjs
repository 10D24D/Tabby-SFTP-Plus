/**
 * 为 24 个 locale/*.po 追加「默认路径模式」5 个新 i18n key（幂等：已存在则跳过）
 *   settings.defaultPathMode / settings.pathModeOff / settings.pathModeRemember
 *   settings.pathModeSync / settings.defaultPathModeHint
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-29
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

// [defaultPathMode, pathModeOff, pathModeRemember, pathModeSync, defaultPathModeHint]
const TRANS = {
  'zh-CN': ['默认路径模式', '关闭', '路径记忆', '与终端同步', '新连接的初始路径模式；面板顶部的路径按钮仍可对单个连接单独切换'],
  'zh-TW': ['預設路徑模式', '關閉', '路徑記憶', '與終端同步', '新連線的初始路徑模式；面板頂部的路徑按鈕仍可對單一連線單獨切換'],
  'en-US': ['Default path mode', 'Off', 'Remember path', 'Sync with terminal', 'Initial path mode for connections; the path button on the panel can still override it per connection'],
  'en-GB': ['Default path mode', 'Off', 'Remember path', 'Sync with terminal', 'Initial path mode for connections; the path button on the panel can still override it per connection'],
  'ja-JP': ['既定のパスモード', 'オフ', 'パス記憶', 'ターミナルと同期', '接続時の初期パスモード。パネル上のボタンで接続ごとに切り替え可能'],
  'ko-KR': ['기본 경로 모드', '끄기', '경로 기억', '터미널과 동기화', '연결의 초기 경로 모드입니다. 패널의 버튼으로 연결별로 계속 전환할 수 있습니다'],
  'de-DE': ['Standard-Pfadmodus', 'Aus', 'Pfad merken', 'Mit Terminal synchronisieren', 'Anfänglicher Pfadmodus für Verbindungen; die Schaltfläche im Panel kann ihn pro Verbindung weiterhin überschreiben'],
  'fr-FR': ['Mode de chemin par défaut', 'Désactivé', 'Mémoriser le chemin', 'Synchroniser avec le terminal', 'Mode de chemin initial des connexions ; le bouton du panneau peut toujours le modifier par connexion'],
  'es-ES': ['Modo de ruta predeterminado', 'Desactivado', 'Recordar ruta', 'Sincronizar con el terminal', 'Modo de ruta inicial para las conexiones; el botón del panel puede seguir cambiándolo por conexión'],
  'it-IT': ['Modalità percorso predefinita', 'Disattivato', 'Ricorda percorso', 'Sincronizza con il terminale', 'Modalità percorso iniziale per le connessioni; il pulsante sul pannello può comunque cambiarla per singola connessione'],
  'pt-BR': ['Modo de caminho padrão', 'Desativado', 'Lembrar caminho', 'Sincronizar com o terminal', 'Modo de caminho inicial das conexões; o botão no painel ainda pode alterá-lo por conexão'],
  'pt-PT': ['Modo de caminho predefinido', 'Desativado', 'Memorizar caminho', 'Sincronizar com o terminal', 'Modo de caminho inicial das ligações; o botão no painel pode continuar a alterá-lo por ligação'],
  'ru-RU': ['Режим пути по умолчанию', 'Выкл.', 'Запоминать путь', 'Синхронизация с терминалом', 'Начальный режим пути для подключений; кнопка на панели может переопределять его для каждого подключения'],
  'uk-UA': ['Режим шляху за замовчуванням', 'Вимк.', "Запам'ятовувати шлях", 'Синхронізація з терміналом', "Початковий режим шляху для з'єднань; кнопка на панелі може змінювати його для окремого з'єднання"],
  'pl-PL': ['Domyślny tryb ścieżki', 'Wyłączone', 'Zapamiętaj ścieżkę', 'Synchronizuj z terminalem', 'Początkowy tryb ścieżki dla połączeń; przycisk na panelu może go nadal zmieniać dla pojedynczego połączenia'],
  'cs-CZ': ['Výchozí režim cesty', 'Vypnuto', 'Zapamatovat cestu', 'Synchronizovat s terminálem', 'Výchozí režim cesty pro připojení; tlačítko na panelu jej může pro jednotlivá připojení přepsat'],
  'tr-TR': ['Varsayılan yol modu', 'Kapalı', 'Yolu hatırla', 'Terminal ile senkronize', 'Bağlantılar için başlangıç yol modu; paneldeki düğme bağlantı başına yine de değiştirebilir'],
  'sv-SE': ['Standardläge för sökväg', 'Av', 'Kom ihåg sökväg', 'Synka med terminalen', 'Initialt sökvägsläge för anslutningar; knappen på panelen kan fortfarande ändra det per anslutning'],
  'da-DK': ['Standardtilstand for sti', 'Fra', 'Husk sti', 'Synkroniser med terminal', 'Indledende stitilstand for forbindelser; knappen på panelet kan stadig tilsidesætte den pr. forbindelse'],
  'bg-BG': ['Режим на пътя по подразбиране', 'Изкл.', 'Запомняне на пътя', 'Синхронизиране с терминала', 'Начален режим на пътя за връзките; бутонът на панела може да го променя за отделна връзка'],
  'hr-HR': ['Zadani način putanje', 'Isključeno', 'Zapamti putanju', 'Sinkronizacija s terminalom', 'Početni način putanje za veze; gumb na ploči i dalje ga može promijeniti po vezi'],
  'sr-Latn': ['Podrazumevani režim putanje', 'Isključeno', 'Zapamti putanju', 'Sinhronizacija sa terminalom', 'Početni režim putanje za veze; dugme na panelu i dalje može da ga promeni po vezi'],
  'id-ID': ['Mode jalur bawaan', 'Nonaktif', 'Ingat jalur', 'Sinkron dengan terminal', 'Mode jalur awal untuk koneksi; tombol pada panel tetap dapat mengubahnya per koneksi'],
  'af-ZA': ['Verstek padmodus', 'Af', 'Onthou pad', 'Sinkroniseer met terminaal', 'Aanvanklike padmodus vir verbindings; die padknoppie op die paneel kan dit steeds per verbinding oorskryf'],
}

const KEYS = ['settings.defaultPathMode', 'settings.pathModeOff', 'settings.pathModeRemember', 'settings.pathModeSync', 'settings.defaultPathModeHint']
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po'))
let touched = 0, added = 0
for (const file of files) {
  const locale = file.replace('.po', '')
  const tr = TRANS[locale]
  if (!tr) { console.warn(`跳过（无译法）: ${file}`); continue }
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')
  let blocks = ''
  KEYS.forEach((key, i) => {
    if (txt.includes(`msgid "${key}"`)) return // 幂等：已存在跳过
    blocks += `\nmsgid "${key}"\nmsgstr "${esc(tr[i])}"\n`
    added++
  })
  if (blocks) {
    if (!txt.endsWith('\n')) txt += '\n'
    fs.writeFileSync(full, txt + blocks, 'utf8')
    touched++
  }
}
console.log(`完成。写入 ${touched} 个文件，共追加 ${added} 个条目。`)
