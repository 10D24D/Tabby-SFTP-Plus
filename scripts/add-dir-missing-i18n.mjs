#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「传输目标目录不存在」相关 key
 *   app.dirMissingTitle     目标目录不存在
 *   app.dirMissingText      传输目标目录不存在，是否创建？
 *   app.dirMissingCreate    创建并传输
 *   app.dirMissingFallback  使用当前目录
 *   app.dirMissingCancel    取消
 *   app.dirCreated          已创建目录：{dir}
 *   app.mkdirpFailed        创建目录失败：{reason}
 *   app.targetNotDir        目标路径不是目录：{dir}
 * 用法：node scripts/add-dir-missing-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾（与
 *   add-duplicate-transfer-i18n.mjs 等既往补丁脚本保持一致）。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'app.dirMissingTitle',
  'app.dirMissingText',
  'app.dirMissingCreate',
  'app.dirMissingFallback',
  'app.dirMissingCancel',
  'app.dirCreated',
  'app.mkdirpFailed',
  'app.targetNotDir',
]

const T = {
  'app.dirMissingTitle': {
    'af-ZA': 'Doelgids bestaan nie',
    'bg-BG': 'Целевата директория не съществува',
    'cs-CZ': 'Cílová složka neexistuje',
    'da-DK': 'Mappen findes ikke',
    'de-DE': 'Zielverzeichnis existiert nicht',
    'en-GB': 'Target directory does not exist',
    'en-US': 'Target directory does not exist',
    'es-ES': 'El directorio de destino no existe',
    'fr-FR': 'Le répertoire cible n\'existe pas',
    'hr-HR': 'Ciljana mapa ne postoji',
    'id-ID': 'Direktori tujuan tidak ada',
    'it-IT': 'La directory di destinazione non esiste',
    'ja-JP': '転送先ディレクトリが存在しません',
    'ko-KR': '대상 디렉터리가 존재하지 않습니다',
    'pl-PL': 'Katalog docelowy nie istnieje',
    'pt-BR': 'O diretório de destino não existe',
    'pt-PT': 'O diretório de destino não existe',
    'ru-RU': 'Целевой каталог не существует',
    'sr-Latn': 'Ciljni direktorijum ne postoji',
    'sv-SE': 'Målkatalogen finns inte',
    'tr-TR': 'Hedef dizin mevcut değil',
    'uk-UA': 'Цільовий каталог не існує',
    'zh-CN': '目标目录不存在',
    'zh-TW': '目標目錄不存在',
  },
  'app.dirMissingText': {
    'af-ZA': 'Die oordragdoelgids bestaan nie. Skep dit?',
    'bg-BG': 'Директорията за прехвърляне не съществува. Да я създам ли?',
    'cs-CZ': 'Cílová složka přenosu neexistuje. Vytvořit ji?',
    'da-DK': 'Overførselsmappen findes ikke. Skal den oprettes?',
    'de-DE': 'Das Zielverzeichnis für die Übertragung existiert nicht. Erstellen?',
    'en-GB': 'The target directory for this transfer does not exist. Create it?',
    'en-US': 'The target directory for this transfer does not exist. Create it?',
    'es-ES': 'El directorio de destino de la transferencia no existe. ¿Crear?',
    'fr-FR': 'Le répertoire cible du transfert n\'existe pas. Le créer ?',
    'hr-HR': 'Ciljana mapa za prijenos ne postoji. Stvoriti je?',
    'id-ID': 'Direktori tujuan transfer tidak ada. Buat?',
    'it-IT': 'La directory di destinazione del trasferimento non esiste. Crearla?',
    'ja-JP': '転送先のディレクトリが存在しません。作成しますか？',
    'ko-KR': '전송 대상 디렉터리가 존재하지 않습니다. 생성하시겠습니까?',
    'pl-PL': 'Katalog docelowy transferu nie istnieje. Utworzyć go?',
    'pt-BR': 'O diretório de destino da transferência não existe. Criar?',
    'pt-PT': 'O diretório de destino da transferência não existe. Criar?',
    'ru-RU': 'Каталог назначения для передачи не существует. Создать его?',
    'sr-Latn': 'Ciljni direktorijum za prenos ne postoji. Napraviti ga?',
    'sv-SE': 'Målkatalogen för överföringen finns inte. Skapa den?',
    'tr-TR': 'Aktarım hedef dizini mevcut değil. Oluşturulsun mu?',
    'uk-UA': 'Каталог призначення для передачі не існує. Створити його?',
    'zh-CN': '传输目标目录不存在，是否创建？',
    'zh-TW': '傳輸目標目錄不存在，是否建立？',
  },
  'app.dirMissingCreate': {
    'af-ZA': 'Skep en oordra',
    'bg-BG': 'Създай и прехвърли',
    'cs-CZ': 'Vytvořit a přenést',
    'da-DK': 'Opret og overfør',
    'de-DE': 'Erstellen und übertragen',
    'en-GB': 'Create and transfer',
    'en-US': 'Create and transfer',
    'es-ES': 'Crear y transferir',
    'fr-FR': 'Créer et transférer',
    'hr-HR': 'Stvori i prenijeti',
    'id-ID': 'Buat dan transfer',
    'it-IT': 'Crea e trasferisci',
    'ja-JP': '作成して転送',
    'ko-KR': '생성 후 전송',
    'pl-PL': 'Utwórz i przekaż',
    'pt-BR': 'Criar e transferir',
    'pt-PT': 'Criar e transferir',
    'ru-RU': 'Создать и передать',
    'sr-Latn': 'Napravi i preneti',
    'sv-SE': 'Skapa och överför',
    'tr-TR': 'Oluştur ve aktar',
    'uk-UA': 'Створити та передати',
    'zh-CN': '创建并传输',
    'zh-TW': '建立並傳輸',
  },
  'app.dirMissingFallback': {
    'af-ZA': 'Gebruik huidige gids',
    'bg-BG': 'Използвай текущата директория',
    'cs-CZ': 'Použít aktuální složku',
    'da-DK': 'Brug nuværende mappe',
    'de-DE': 'Aktuelles Verzeichnis verwenden',
    'en-GB': 'Use current directory',
    'en-US': 'Use current directory',
    'es-ES': 'Usar el directorio actual',
    'fr-FR': 'Utiliser le répertoire actuel',
    'hr-HR': 'Koristi trenutnu mapu',
    'id-ID': 'Gunakan direktori saat ini',
    'it-IT': 'Usa directory corrente',
    'ja-JP': '現在のディレクトリを使用',
    'ko-KR': '현재 디렉터리 사용',
    'pl-PL': 'Użyj bieżącego katalogu',
    'pt-BR': 'Usar o diretório atual',
    'pt-PT': 'Usar o diretório atual',
    'ru-RU': 'Использовать текущий каталог',
    'sr-Latn': 'Koristi trenutni direktorijum',
    'sv-SE': 'Använd aktuell katalog',
    'tr-TR': 'Geçerli dizini kullan',
    'uk-UA': 'Використати поточний каталог',
    'zh-CN': '使用当前目录',
    'zh-TW': '使用目前目錄',
  },
  'app.dirMissingCancel': {
    'af-ZA': 'Kanselleer',
    'bg-BG': 'Отказ',
    'cs-CZ': 'Zrušit',
    'da-DK': 'Annuller',
    'de-DE': 'Abbrechen',
    'en-GB': 'Cancel',
    'en-US': 'Cancel',
    'es-ES': 'Cancelar',
    'fr-FR': 'Annuler',
    'hr-HR': 'Odustani',
    'id-ID': 'Batal',
    'it-IT': 'Annulla',
    'ja-JP': 'キャンセル',
    'ko-KR': '취소',
    'pl-PL': 'Anuluj',
    'pt-BR': 'Cancelar',
    'pt-PT': 'Cancelar',
    'ru-RU': 'Отмена',
    'sr-Latn': 'Otkaži',
    'sv-SE': 'Avbryt',
    'tr-TR': 'İptal',
    'uk-UA': 'Скасувати',
    'zh-CN': '取消',
    'zh-TW': '取消',
  },
  'app.dirCreated': {
    'af-ZA': 'Gids geskep: {dir}',
    'bg-BG': 'Директорията е създадена: {dir}',
    'cs-CZ': 'Složka vytvořena: {dir}',
    'da-DK': 'Mappe oprettet: {dir}',
    'de-DE': 'Verzeichnis erstellt: {dir}',
    'en-GB': 'Directory created: {dir}',
    'en-US': 'Directory created: {dir}',
    'es-ES': 'Directorio creado: {dir}',
    'fr-FR': 'Répertoire créé : {dir}',
    'hr-HR': 'Mapa je stvorena: {dir}',
    'id-ID': 'Direktori dibuat: {dir}',
    'it-IT': 'Directory creata: {dir}',
    'ja-JP': 'ディレクトリを作成しました: {dir}',
    'ko-KR': '디렉터리 생성됨: {dir}',
    'pl-PL': 'Utworzono katalog: {dir}',
    'pt-BR': 'Diretório criado: {dir}',
    'pt-PT': 'Diretório criado: {dir}',
    'ru-RU': 'Каталог создан: {dir}',
    'sr-Latn': 'Direktorijum je napravljen: {dir}',
    'sv-SE': 'Katalog skapad: {dir}',
    'tr-TR': 'Dizin oluşturuldu: {dir}',
    'uk-UA': 'Каталог створено: {dir}',
    'zh-CN': '已创建目录：{dir}',
    'zh-TW': '已建立目錄：{dir}',
  },
  'app.mkdirpFailed': {
    'af-ZA': 'Kon gids nie skep nie: {reason}',
    'bg-BG': 'Неуспешно създаване на директория: {reason}',
    'cs-CZ': 'Vytvoření složky selhalo: {reason}',
    'da-DK': 'Kunne ikke oprette mappe: {reason}',
    'de-DE': 'Verzeichnis konnte nicht erstellt werden: {reason}',
    'en-GB': 'Failed to create directory: {reason}',
    'en-US': 'Failed to create directory: {reason}',
    'es-ES': 'Error al crear el directorio: {reason}',
    'fr-FR': 'Échec de la création du répertoire : {reason}',
    'hr-HR': 'Stvaranje mape nije uspjelo: {reason}',
    'id-ID': 'Gagal membuat direktori: {reason}',
    'it-IT': 'Creazione della directory non riuscita: {reason}',
    'ja-JP': 'ディレクトリの作成に失敗しました: {reason}',
    'ko-KR': '디렉터리 생성 실패: {reason}',
    'pl-PL': 'Nie udało się utworzyć katalogu: {reason}',
    'pt-BR': 'Falha ao criar diretório: {reason}',
    'pt-PT': 'Falha ao criar diretório: {reason}',
    'ru-RU': 'Не удалось создать каталог: {reason}',
    'sr-Latn': 'Nije uspelo pravljenje direktorijuma: {reason}',
    'sv-SE': 'Kunde inte skapa katalog: {reason}',
    'tr-TR': 'Dizin oluşturulamadı: {reason}',
    'uk-UA': 'Не вдалося створити каталог: {reason}',
    'zh-CN': '创建目录失败：{reason}',
    'zh-TW': '建立目錄失敗：{reason}',
  },
  'app.targetNotDir': {
    'af-ZA': 'Doelpad is nie \'n gids nie: {dir}',
    'bg-BG': 'Целевият път не е директория: {dir}',
    'cs-CZ': 'Cílová cesta není složka: {dir}',
    'da-DK': 'Målstien er ikke en mappe: {dir}',
    'de-DE': 'Zielpfad ist kein Verzeichnis: {dir}',
    'en-GB': 'Target path is not a directory: {dir}',
    'en-US': 'Target path is not a directory: {dir}',
    'es-ES': 'La ruta de destino no es un directorio: {dir}',
    'fr-FR': 'Le chemin cible n\'est pas un répertoire : {dir}',
    'hr-HR': 'Ciljana putanja nije mapa: {dir}',
    'id-ID': 'Jalur tujuan bukan direktori: {dir}',
    'it-IT': 'Il percorso di destinazione non è una directory: {dir}',
    'ja-JP': '転送先パスはディレクトリではありません: {dir}',
    'ko-KR': '대상 경로가 디렉터리가 아닙니다: {dir}',
    'pl-PL': 'Ścieżka docelowa nie jest katalogiem: {dir}',
    'pt-BR': 'O caminho de destino não é um diretório: {dir}',
    'pt-PT': 'O caminho de destino não é um diretório: {dir}',
    'ru-RU': 'Целевой путь не является каталогом: {dir}',
    'sr-Latn': 'Ciljna putanja nije direktorijum: {dir}',
    'sv-SE': 'Målsökvägen är inte en katalog: {dir}',
    'tr-TR': 'Hedef yol bir dizin değil: {dir}',
    'uk-UA': 'Цільовий шлях не є каталогом: {dir}',
    'zh-CN': '目标路径不是目录：{dir}',
    'zh-TW': '目標路徑不是目錄：{dir}',
  },
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  let added = 0
  for (const key of KEYS) {
    const text = T[key][locale]
    if (!text) { console.warn('skip unknown locale:', file, key); continue }
    if (text.includes('"')) { console.error('FATAL: translation contains a double quote:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue  // 已存在则跳过（幂等）
    raw = raw.replace(/\s*$/, '\n\n') + `msgid "${key}"\nmsgstr "${text}"\n\n`
    added++
  }
  if (added > 0) {
    fs.writeFileSync(fp, raw, 'utf8')
    console.log('patched:', file, `(${added} keys)`)
    totalAdded += added
  }
}
console.log(`Done. totalAdded=${totalAdded}`)
