/**
 * 更新既有键 settings.hideAuthorConfirmText 的译文：追加「点赞是开发动力」感谢语（幂等）
 * 注意：locale/*.po 为 CRLF 换行，行匹配必须用 \r?\n
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-11
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const KEY = 'settings.hideAuthorConfirmText'
const TRANS = {
  'zh-CN': '隐藏作者信息前，请先为插件仓库点 Star 支持一下。仓库页面已在浏览器中打开。您的点赞支持是我开发的动力，感谢支持！🙏',
  'zh-TW': '隱藏作者資訊前，請先為外掛倉庫點 Star 支持一下。倉庫頁面已在瀏覽器中打開。您的點讚支持是我開發的動力，感謝支持！🙏',
  'en-US': 'Before hiding the author info, please star the plugin repository to show your support. The repository page has been opened in your browser. Your star is what keeps me developing — thank you for your support! 🙏',
  'en-GB': 'Before hiding the author info, please star the plugin repository to show your support. The repository page has been opened in your browser. Your star is what keeps me developing — thank you for your support! 🙏',
  'ja-JP': '作者情報を非表示にする前に、プラグインのリポジトリに Star を付けて応援してください。リポジトリページはブラウザで開かれました。あなたの Star が開発の励みになります。応援ありがとうございます！🙏',
  'ko-KR': '제작자 정보를 숨기기 전에 플러그인 저장소에 Star를 눌러 응원해 주세요. 저장소 페이지가 브라우저에서 열렸습니다. 여러분의 Star가 개발의 원동력입니다. 응원해 주셔서 감사합니다! 🙏',
  'de-DE': 'Bevor Sie die Autoreninformationen ausblenden, geben Sie dem Plugin-Repository bitte einen Star. Die Repository-Seite wurde im Browser geöffnet. Ihr Star ist meine Motivation für die Entwicklung — vielen Dank für Ihre Unterstützung! 🙏',
  'fr-FR': "Avant de masquer les informations sur l'auteur, merci d'ajouter une étoile au dépôt du plugin. La page du dépôt a été ouverte dans votre navigateur. Votre étoile est ma motivation pour développer — merci pour votre soutien ! 🙏",
  'es-ES': 'Antes de ocultar la información del autor, dale una estrella al repositorio del complemento. La página del repositorio se ha abierto en tu navegador. Tu estrella es mi motivación para desarrollar — ¡gracias por tu apoyo! 🙏',
  'it-IT': "Prima di nascondere le informazioni sull'autore, metti una stella al repository del plugin. La pagina del repository è stata aperta nel browser. La tua stella è la mia motivazione per sviluppare — grazie per il supporto! 🙏",
  'pt-BR': 'Antes de ocultar as informações do autor, dê uma estrela ao repositório do plugin. A página do repositório foi aberta no navegador. Sua estrela é minha motivação para desenvolver — obrigado pelo apoio! 🙏',
  'pt-PT': 'Antes de ocultar as informações do autor, dê uma estrela ao repositório do plugin. A página do repositório foi aberta no navegador. A sua estrela é a minha motivação para desenvolver — obrigado pelo apoio! 🙏',
  'ru-RU': 'Прежде чем скрыть информацию об авторе, поставьте звезду репозиторию плагина. Страница репозитория открыта в браузере. Ваша звезда — моя мотивация развивать проект. Спасибо за поддержку! 🙏',
  'uk-UA': 'Перш ніж приховати інформацію про автора, поставте зірку репозиторію плагіна. Сторінку репозиторію відкрито у браузері. Ваша зірка — моя мотивація розвивати проєкт. Дякую за підтримку! 🙏',
  'pl-PL': 'Przed ukryciem informacji o autorze dodaj gwiazdkę repozytorium wtyczki. Strona repozytorium została otwarta w przeglądarce. Twoja gwiazdka to moja motywacja do rozwoju — dziękuję za wsparcie! 🙏',
  'cs-CZ': 'Než skryjete informace o autorovi, dejte prosím hvězdičku repozitáři pluginu. Stránka repozitáře byla otevřena v prohlížeči. Vaše hvězdička je mou motivací k vývoji — děkuji za podporu! 🙏',
  'tr-TR': 'Yazar bilgilerini gizlemeden önce lütfen eklenti deposuna bir yıldız verin. Depo sayfası tarayıcınızda açıldı. Yıldızınız geliştirmeye devam etme motivasyonumdur — desteğiniz için teşekkürler! 🙏',
  'sv-SE': 'Innan du döljer författarinformationen, ge gärna pluginförrådet en stjärna. Förrådssidan har öppnats i webbläsaren. Din stjärna är min motivation att utveckla — tack för ditt stöd! 🙏',
  'da-DK': 'Før du skjuler forfatteroplysningerne, giv venligst plugin-lageret en stjerne. Lagersiden er åbnet i din browser. Din stjerne er min motivation til at udvikle — tak for din støtte! 🙏',
  'bg-BG': 'Преди да скриете информацията за автора, моля, дайте звезда на хранилището на плъгина. Страницата на хранилището е отворена в браузъра. Вашата звезда е моята мотивация да разработвам — благодаря за подкрепата! 🙏',
  'hr-HR': 'Prije skrivanja podataka o autoru, dajte zvjezdicu repozitoriju dodatka. Stranica repozitorija otvorena je u pregledniku. Vaša zvjezdica je moja motivacija za razvoj — hvala na podršci! 🙏',
  'sr-Latn': 'Pre skrivanja podataka o autoru, dajte zvezdicu repozitorijumu dodatka. Stranica repozitorijuma otvorena je u pregledaču. Vaša zvezdica je moja motivacija za razvoj — hvala na podršci! 🙏',
  'id-ID': 'Sebelum menyembunyikan info pembuat, berikan bintang ke repositori plugin. Halaman repositori telah dibuka di browser. Bintang Anda adalah motivasi saya dalam mengembangkan — terima kasih atas dukungannya! 🙏',
  'af-ZA': "Voordat jy die outeurinligting versteek, gee asseblief 'n ster aan die inprop-bewaarplek. Die bewaarplekblad is in jou blaaier oopgemaak. Jou ster is my motivasie om te ontwikkel — dankie vir jou ondersteuning! 🙏",
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

let touched = 0
for (const [locale, tr] of Object.entries(TRANS)) {
  const full = path.join(localeDir, `${locale}.po`)
  if (!fs.existsSync(full)) { console.warn(`跳过（文件不存在）: ${locale}.po`); continue }
  let txt = fs.readFileSync(full, 'utf8')
  const re = new RegExp(`(msgid "${KEY.replace(/\./g, '\\.')}")(\\r?\\n)msgstr ".*?"`, 'm')
  const m = txt.match(re)
  if (!m) { console.warn(`警告（未找到键）: ${locale}.po`); continue }
  if (m[0].endsWith(`msgstr "${esc(tr)}"`)) continue // 幂等：已是目标值
  txt = txt.replace(re, `$1$2msgstr "${esc(tr)}"`)
  fs.writeFileSync(full, txt, 'utf8')
  touched++
}
console.log(`完成。写入 ${touched} 个文件。`)
