/**
 * 为 24 个 locale/*.po 处理「面板快捷键多绑定」相关 i18n（幂等，可重复执行）：
 *   1) 追加 6 个新 key：settings.phk.forward / settings.mouseBack / settings.mouseForward
 *      / settings.hotkeyAdd / settings.hotkeyDuplicate / settings.hotkeyMouseHint
 *   2) 更新 2 个既有 key 的文案：「热键」统一改为「快捷键」
 *      （settings.hotkeys、settings.panelHotkeyConflict）
 * 仅改原文就是「热键」直译的语言；原译已是「快捷键/快捷方式」含义的语言保持不变。
 * 创建人：DD1024z + Hy3 preview
 * 创建时间：2026-08-31
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

/** 新增 key 的 24 语言译文 */
const NEW_KEYS = {
  'settings.phk.forward': {
    'zh-CN': '前进',
    'zh-TW': '前進',
    'en-US': 'Forward',
    'en-GB': 'Forward',
    'ja-JP': '進む',
    'ko-KR': '앞으로',
    'de-DE': 'Vorwärts',
    'fr-FR': 'Suivant',
    'es-ES': 'Adelante',
    'it-IT': 'Avanti',
    'pt-BR': 'Avançar',
    'pt-PT': 'Avançar',
    'ru-RU': 'Вперёд',
    'uk-UA': 'Вперед',
    'pl-PL': 'Do przodu',
    'cs-CZ': 'Vpřed',
    'tr-TR': 'İleri',
    'sv-SE': 'Framåt',
    'da-DK': 'Frem',
    'bg-BG': 'Напред',
    'hr-HR': 'Naprijed',
    'sr-Latn': 'Napred',
    'id-ID': 'Maju',
    'af-ZA': 'Vorentoe',
  },
  'settings.mouseBack': {
    'zh-CN': '鼠标后退键',
    'zh-TW': '滑鼠後退鍵',
    'en-US': 'Mouse back button',
    'en-GB': 'Mouse back button',
    'ja-JP': 'マウス「戻る」ボタン',
    'ko-KR': '마우스 뒤로 버튼',
    'de-DE': 'Maus-Zurück-Taste',
    'fr-FR': 'Bouton retour de la souris',
    'es-ES': 'Botón atrás del ratón',
    'it-IT': 'Pulsante indietro del mouse',
    'pt-BR': 'Botão voltar do mouse',
    'pt-PT': 'Botão voltar do rato',
    'ru-RU': 'Кнопка «Назад» мыши',
    'uk-UA': 'Кнопка «Назад» миші',
    'pl-PL': 'Przycisk Wstecz myszy',
    'cs-CZ': 'Tlačítko Zpět myši',
    'tr-TR': 'Fare geri tuşu',
    'sv-SE': 'Musens bakåtknapp',
    'da-DK': 'Musens tilbage-knap',
    'bg-BG': 'Бутон „Назад“ на мишката',
    'hr-HR': 'Tipka Natrag na mišu',
    'sr-Latn': 'Dugme Nazad na mišu',
    'id-ID': 'Tombol kembali mouse',
    'af-ZA': 'Muis-terugknoppie',
  },
  'settings.mouseForward': {
    'zh-CN': '鼠标前进键',
    'zh-TW': '滑鼠前進鍵',
    'en-US': 'Mouse forward button',
    'en-GB': 'Mouse forward button',
    'ja-JP': 'マウス「進む」ボタン',
    'ko-KR': '마우스 앞으로 버튼',
    'de-DE': 'Maus-Vorwärts-Taste',
    'fr-FR': 'Bouton suivant de la souris',
    'es-ES': 'Botón adelante del ratón',
    'it-IT': 'Pulsante avanti del mouse',
    'pt-BR': 'Botão avançar do mouse',
    'pt-PT': 'Botão avançar do rato',
    'ru-RU': 'Кнопка «Вперёд» мыши',
    'uk-UA': 'Кнопка «Вперед» миші',
    'pl-PL': 'Przycisk Dalej myszy',
    'cs-CZ': 'Tlačítko Vpřed myši',
    'tr-TR': 'Fare ileri tuşu',
    'sv-SE': 'Musens framåtknapp',
    'da-DK': 'Musens frem-knap',
    'bg-BG': 'Бутон „Напред“ на мишката',
    'hr-HR': 'Tipka Naprijed na mišu',
    'sr-Latn': 'Dugme Napred na mišu',
    'id-ID': 'Tombol maju mouse',
    'af-ZA': 'Muis-vorentoe-knoppie',
  },
  'settings.hotkeyAdd': {
    'zh-CN': '添加快捷键',
    'zh-TW': '新增快捷鍵',
    'en-US': 'Add shortcut',
    'en-GB': 'Add shortcut',
    'ja-JP': 'ショートカットを追加',
    'ko-KR': '단축키 추가',
    'de-DE': 'Tastenkürzel hinzufügen',
    'fr-FR': 'Ajouter un raccourci',
    'es-ES': 'Añadir atajo',
    'it-IT': 'Aggiungi scorciatoia',
    'pt-BR': 'Adicionar atalho',
    'pt-PT': 'Adicionar atalho',
    'ru-RU': 'Добавить комбинацию',
    'uk-UA': 'Додати комбінацію',
    'pl-PL': 'Dodaj skrót',
    'cs-CZ': 'Přidat zkratku',
    'tr-TR': 'Kısayol ekle',
    'sv-SE': 'Lägg till genväg',
    'da-DK': 'Tilføj genvej',
    'bg-BG': 'Добавяне на комбинация',
    'hr-HR': 'Dodaj prečac',
    'sr-Latn': 'Dodaj prečicu',
    'id-ID': 'Tambah pintasan',
    'af-ZA': 'Voeg kortpad by',
  },
  'settings.hotkeyDuplicate': {
    'zh-CN': '该快捷键已绑定到当前动作',
    'zh-TW': '此快捷鍵已綁定至目前動作',
    'en-US': 'This shortcut is already bound to this action',
    'en-GB': 'This shortcut is already bound to this action',
    'ja-JP': 'このショートカットは既にこの操作に割り当てられています',
    'ko-KR': '이 단축키는 이미 이 동작에 바인딩되어 있습니다',
    'de-DE': 'Dieses Tastenkürzel ist bereits an diese Aktion gebunden',
    'fr-FR': 'Ce raccourci est déjà associé à cette action',
    'es-ES': 'Este atajo ya está asignado a esta acción',
    'it-IT': 'Questa scorciatoia è già associata a questa azione',
    'pt-BR': 'Este atalho já está vinculado a esta ação',
    'pt-PT': 'Este atalho já está associado a esta ação',
    'ru-RU': 'Эта комбинация уже назначена этому действию',
    'uk-UA': 'Ця комбінація вже призначена цій дії',
    'pl-PL': 'Ten skrót jest już przypisany do tej akcji',
    'cs-CZ': 'Tato zkratka je již přiřazena této akci',
    'tr-TR': 'Bu kısayol zaten bu eyleme atanmış',
    'sv-SE': 'Denna genväg är redan bunden till denna åtgärd',
    'da-DK': 'Denne genvej er allerede bundet til denne handling',
    'bg-BG': 'Тази комбинация вече е назначена на това действие',
    'hr-HR': 'Ovaj prečac je već dodijeljen ovoj radnji',
    'sr-Latn': 'Ova prečica je već dodeljena ovoj radnji',
    'id-ID': 'Pintasan ini sudah terikat ke tindakan ini',
    'af-ZA': 'Hierdie kortpad is reeds aan hierdie aksie gekoppel',
  },
  'settings.hotkeyMouseHint': {
    'zh-CN': '鼠标侧键绑定，点击可重新录制',
    'zh-TW': '滑鼠側鍵綁定，點擊可重新錄製',
    'en-US': 'Mouse side-button binding, click to re-record',
    'en-GB': 'Mouse side-button binding, click to re-record',
    'ja-JP': 'マウスサイドボタンの割り当て。クリックで再設定',
    'ko-KR': '마우스 측면 버튼 바인딩, 클릭하여 다시 기록',
    'de-DE': 'Maustasten-Belegung, zum erneuten Aufzeichnen klicken',
    'fr-FR': 'Affectation d’un bouton latéral de la souris, cliquez pour réenregistrer',
    'es-ES': 'Asignación de botón lateral del ratón, haz clic para volver a grabar',
    'it-IT': 'Associazione pulsante laterale del mouse, clicca per registrare di nuovo',
    'pt-BR': 'Vinculação de botão lateral do mouse, clique para gravar novamente',
    'pt-PT': 'Associação de botão lateral do rato, clique para gravar novamente',
    'ru-RU': 'Привязка боковой кнопки мыши, нажмите для повторной записи',
    'uk-UA': 'Прив’язка бічної кнопки миші, натисніть для повторного запису',
    'pl-PL': 'Przypisanie bocznego przycisku myszy, kliknij aby nagrać ponownie',
    'cs-CZ': 'Přiřazení bočního tlačítka myši, kliknutím nahrajete znovu',
    'tr-TR': 'Fare yan tuş ataması, yeniden kaydetmek için tıklayın',
    'sv-SE': 'Musens sidoknapp, klicka för att spela in igen',
    'da-DK': 'Musens sideknap, klik for at optage igen',
    'bg-BG': 'Присвояване на страничен бутон на мишката, щракнете за повторен запис',
    'hr-HR': 'Dodjela bočne tipke miša, kliknite za ponovno snimanje',
    'sr-Latn': 'Dodela bočnog dugmeta miša, kliknite za ponovno snimanje',
    'id-ID': 'Binding tombol samping mouse, klik untuk merekam ulang',
    'af-ZA': 'Muiskantknoppie-binding, klik om weer op te neem',
  },
  'settings.occupied.title': {
    'zh-CN': '已占用快捷键',
    'zh-TW': '已佔用快捷鍵',
    'en-US': 'Occupied shortcuts',
    'en-GB': 'Occupied shortcuts',
    'ja-JP': '占有済みショートカット',
    'ko-KR': '사용 중인 단축키',
    'de-DE': 'Belegte Tastenkürzel',
    'fr-FR': 'Raccourcis occupés',
    'es-ES': 'Atajos ocupados',
    'it-IT': 'Scorciatoie occupate',
    'pt-BR': 'Atalhos ocupados',
    'pt-PT': 'Atalhos ocupados',
    'ru-RU': 'Занятые комбинации',
    'uk-UA': 'Зайняті комбінації',
    'pl-PL': 'Zajęte skróty',
    'cs-CZ': 'Obsazené zkratky',
    'tr-TR': 'Kullanılan kısayollar',
    'sv-SE': 'Upptagna genvägar',
    'da-DK': 'Optagede genveje',
    'bg-BG': 'Заети комбинации',
    'hr-HR': 'Zauzeti prečaci',
    'sr-Latn': 'Zauzete prečice',
    'id-ID': 'Pintasan yang digunakan',
    'af-ZA': 'Besette kortpaaie',
  },
  'settings.occupied.hint': {
    'zh-CN': '以下键位由 SFTP+ 固定占用、不可修改。为上方动作设置快捷键时请避开这些组合，以免互相抢触发。',
    'zh-TW': '以下鍵位由 SFTP+ 固定佔用、不可修改。為上方動作設定快捷鍵時請避開這些組合，以免互相搶觸發。',
    'en-US': 'These keys are reserved by SFTP+ and cannot be changed. Avoid them when assigning shortcuts above, or both may fire.',
    'en-GB': 'These keys are reserved by SFTP+ and cannot be changed. Avoid them when assigning shortcuts above, or both may fire.',
    'ja-JP': '以下のキーは SFTP+ が予約しており変更できません。上のショートカットを設定する際はこれらの組み合わせを避けてください（同時に発火する可能性があります）。',
    'ko-KR': '다음 키는 SFTP+에서 예약되어 변경할 수 없습니다. 위 단축키를 지정할 때는 이러한 조합을 피하세요(동시에 실행될 수 있습니다).',
    'de-DE': 'Diese Tasten sind von SFTP+ reserviert und können nicht geändert werden. Vermeiden Sie sie beim Zuweisen von Tastenkürzeln oben, da sonst beide ausgelöst werden können.',
    'fr-FR': 'Ces touches sont réservées par SFTP+ et ne peuvent pas être modifiées. Évitez-les lors de l’attribution des raccourcis ci-dessus, sinon les deux peuvent se déclencher.',
    'es-ES': 'Estas teclas están reservadas por SFTP+ y no se pueden cambiar. Evítalas al asignar atajos arriba, o ambos podrían activarse.',
    'it-IT': 'Questi tasti sono riservati da SFTP+ e non possono essere modificati. Evitali quando assegni le scorciatoie sopra, altrimenti entrambi potrebbero attivarsi.',
    'pt-BR': 'Estas teclas são reservadas pelo SFTP+ e não podem ser alteradas. Evite-as ao atribuir atalhos acima, ou ambos podem ser acionados.',
    'pt-PT': 'Estas teclas são reservadas pelo SFTP+ e não podem ser alteradas. Evite-as ao atribuir atalhos acima, ou ambos podem ser ativados.',
    'ru-RU': 'Эти клавиши зарезервированы SFTP+ и не могут быть изменены. Избегайте их при назначении комбинаций выше, иначе могут сработать обе.',
    'uk-UA': 'Ці клавіші зарезервовані SFTP+ і не можуть бути змінені. Уникайте їх при призначенні комбінацій вище, інакше можуть спрацювати обидві.',
    'pl-PL': 'Te klawisze są zarezerwowane przez SFTP+ i nie można ich zmienić. Unikaj ich przy przypisywaniu skrótów powyżej, w przeciwnym razie mogą zadziałać oba.',
    'cs-CZ': 'Tyto klávesy jsou vyhrazeny pro SFTP+ a nelze je změnit. Při přiřazování zkratek výše se jim vyhněte, jinak mohou být spuštěny obě.',
    'tr-TR': 'Bu tuşlar SFTP+ tarafından ayrılmıştır ve değiştirilemez. Yukarıdaki kısayolları atarken bunlardan kaçının, aksi halde ikisi de tetiklenebilir.',
    'sv-SE': 'Dessa tangenter är reserverade av SFTP+ och kan inte ändras. Undvik dem när du tilldelar genvägar ovan, annars kan båda utlösas.',
    'da-DK': 'Disse taster er reserveret af SFTP+ og kan ikke ændres. Undgå dem, når du tildeler genveje ovenfor, ellers kan begge udløses.',
    'bg-BG': 'Тези клавиши са запазени от SFTP+ и не могат да се променят. Избягвайте ги при задаване на комбинации по-горе, иначе и двете могат да се задействат.',
    'hr-HR': 'Ove tipke su rezervirane za SFTP+ i ne mogu se mijenjati. Izbjegavajte ih pri dodjeli prečaca gore, inače se mogu aktivirati obje.',
    'sr-Latn': 'Ovi tasteri su rezervisani za SFTP+ i ne mogu se menjati. Izbegavajte ih pri dodeli prečica gore, inače mogu obe da se aktiviraju.',
    'id-ID': 'Tombol ini dicadangkan oleh SFTP+ dan tidak dapat diubah. Hindari tombol ini saat menetapkan pintasan di atas, atau keduanya dapat terpicu.',
    'af-ZA': 'Hierdie sleutels is deur SFTP+ gereserveer en kan nie verander word nie. Vermy hulle wanneer jy kortpaaie hierbo toewys, anders kan albei aktiveer.',
  },
  'settings.occupied.groupPanel': {
    'zh-CN': '面板', 'zh-TW': '面板', 'en-US': 'Panel', 'en-GB': 'Panel',
    'ja-JP': 'パネル', 'ko-KR': '패널', 'de-DE': 'Panel', 'fr-FR': 'Panneau',
    'es-ES': 'Panel', 'it-IT': 'Pannello', 'pt-BR': 'Painel', 'pt-PT': 'Painel',
    'ru-RU': 'Панель', 'uk-UA': 'Панель', 'pl-PL': 'Panel', 'cs-CZ': 'Panel',
    'tr-TR': 'Panel', 'sv-SE': 'Panel', 'da-DK': 'Panel', 'bg-BG': 'Панел',
    'hr-HR': 'Panel', 'sr-Latn': 'Panel', 'id-ID': 'Panel', 'af-ZA': 'Paneel',
  },
  'settings.occupied.groupViewer': {
    'zh-CN': '查看器', 'zh-TW': '檢視器', 'en-US': 'Viewer', 'en-GB': 'Viewer',
    'ja-JP': 'ビューア', 'ko-KR': '뷰어', 'de-DE': 'Betrachter', 'fr-FR': 'Visionneuse',
    'es-ES': 'Visor', 'it-IT': 'Visualizzatore', 'pt-BR': 'Visualizador', 'pt-PT': 'Visualizador',
    'ru-RU': 'Просмотрщик', 'uk-UA': 'Переглядач', 'pl-PL': 'Podgląd', 'cs-CZ': 'Prohlížeč',
    'tr-TR': 'Görüntüleyici', 'sv-SE': 'Visare', 'da-DK': 'Fremviser', 'bg-BG': 'Преглед',
    'hr-HR': 'Preglednik', 'sr-Latn': 'Pregledač', 'id-ID': 'Penampil', 'af-ZA': 'Kyker',
  },
  'settings.occupied.groupDialog': {
    'zh-CN': '对话框', 'zh-TW': '對話方塊', 'en-US': 'Dialogs', 'en-GB': 'Dialogs',
    'ja-JP': 'ダイアログ', 'ko-KR': '대화 상자', 'de-DE': 'Dialoge', 'fr-FR': 'Boîtes de dialogue',
    'es-ES': 'Diálogos', 'it-IT': 'Finestre di dialogo', 'pt-BR': 'Diálogos', 'pt-PT': 'Diálogos',
    'ru-RU': 'Диалоги', 'uk-UA': 'Діалоги', 'pl-PL': 'Okna dialogowe', 'cs-CZ': 'Dialogy',
    'tr-TR': 'İletişim kutuları', 'sv-SE': 'Dialogrutor', 'da-DK': 'Dialogbokse', 'bg-BG': 'Диалогови прозорци',
    'hr-HR': 'Dijalozi', 'sr-Latn': 'Dijalozi', 'id-ID': 'Dialog', 'af-ZA': 'Dialoogvensters',
  },
  'settings.occupied.moveSelection': {
    'zh-CN': '上下移动选中项', 'zh-TW': '上下移動選取項目',
    'en-US': 'Move selection up / down', 'en-GB': 'Move selection up / down',
    'ja-JP': '選択項目を上下に移動', 'ko-KR': '선택 항목 위/아래로 이동',
    'de-DE': 'Auswahl nach oben/unten bewegen', 'fr-FR': 'Déplacer la sélection vers le haut / le bas',
    'es-ES': 'Mover la selección arriba / abajo', 'it-IT': 'Sposta la selezione su / giù',
    'pt-BR': 'Mover a seleção para cima / baixo', 'pt-PT': 'Mover a seleção para cima / baixo',
    'ru-RU': 'Переместить выделение вверх / вниз', 'uk-UA': 'Перемістити виділення вгору / вниз',
    'pl-PL': 'Przesuń zaznaczenie w górę / w dół', 'cs-CZ': 'Přesunout výběr nahoru / dolů',
    'tr-TR': 'Seçimi yukarı / aşağı taşı', 'sv-SE': 'Flytta markeringen upp / ner',
    'da-DK': 'Flyt markeringen op / ned', 'bg-BG': 'Преместване на избора нагоре / надолу',
    'hr-HR': 'Pomakni odabir gore / dolje', 'sr-Latn': 'Pomeri izbor gore / dole',
    'id-ID': 'Pindahkan pilihan ke atas / bawah', 'af-ZA': 'Skuif keuse op / af',
  },
  'settings.occupied.multiSelect': {
    'zh-CN': '配合点击多选', 'zh-TW': '配合點擊多選',
    'en-US': 'Multi-select with click', 'en-GB': 'Multi-select with click',
    'ja-JP': 'クリックで複数選択', 'ko-KR': '클릭으로 다중 선택',
    'de-DE': 'Mehrfachauswahl per Klick', 'fr-FR': 'Sélection multiple au clic',
    'es-ES': 'Selección múltiple con clic', 'it-IT': 'Selezione multipla con clic',
    'pt-BR': 'Seleção múltipla com clique', 'pt-PT': 'Seleção múltipla com clique',
    'ru-RU': 'Множественный выбор щелчком', 'uk-UA': 'Множинний вибір клацанням',
    'pl-PL': 'Zaznaczanie wielokrotne kliknięciem', 'cs-CZ': 'Vícenásobný výběr kliknutím',
    'tr-TR': 'Tıklama ile çoklu seçim', 'sv-SE': 'Flerval med klick',
    'da-DK': 'Multivalg med klik', 'bg-BG': 'Множествен избор с щракване',
    'hr-HR': 'Višestruki odabir klikom', 'sr-Latn': 'Višestruki izbor klikom',
    'id-ID': 'Pilih ganda dengan klik', 'af-ZA': 'Meervoudige keuse met klik',
  },
  'settings.occupied.prevNextImage': {
    'zh-CN': '切换上一张 / 下一张图片', 'zh-TW': '切換上一張 / 下一張圖片',
    'en-US': 'Previous / next image', 'en-GB': 'Previous / next image',
    'ja-JP': '前 / 次の画像へ切り替え', 'ko-KR': '이전 / 다음 이미지로 전환',
    'de-DE': 'Vorheriges / nächstes Bild', 'fr-FR': 'Image précédente / suivante',
    'es-ES': 'Imagen anterior / siguiente', 'it-IT': 'Immagine precedente / successiva',
    'pt-BR': 'Imagem anterior / próxima', 'pt-PT': 'Imagem anterior / seguinte',
    'ru-RU': 'Предыдущее / следующее изображение', 'uk-UA': 'Попереднє / наступне зображення',
    'pl-PL': 'Poprzedni / następny obraz', 'cs-CZ': 'Předchozí / další obrázek',
    'tr-TR': 'Önceki / sonraki görsel', 'sv-SE': 'Föregående / nästa bild',
    'da-DK': 'Forrige / næste billede', 'bg-BG': 'Предишно / следващо изображение',
    'hr-HR': 'Prethodna / sljedeća slika', 'sr-Latn': 'Prethodna / sledeća slika',
    'id-ID': 'Gambar sebelumnya / berikutnya', 'af-ZA': 'Vorige / volgende prent',
  },
  'settings.occupied.closeDialog': {
    'zh-CN': '关闭对话框 / 查看器 / 面板', 'zh-TW': '關閉對話方塊 / 檢視器 / 面板',
    'en-US': 'Close dialog / viewer / panel', 'en-GB': 'Close dialog / viewer / panel',
    'ja-JP': 'ダイアログ / ビューア / パネルを閉じる', 'ko-KR': '대화 상자 / 뷰어 / 패널 닫기',
    'de-DE': 'Dialog / Betrachter / Panel schließen', 'fr-FR': 'Fermer la boîte de dialogue / la visionneuse / le panneau',
    'es-ES': 'Cerrar diálogo / visor / panel', 'it-IT': 'Chiudi finestra / visualizzatore / pannello',
    'pt-BR': 'Fechar diálogo / visualizador / painel', 'pt-PT': 'Fechar diálogo / visualizador / painel',
    'ru-RU': 'Закрыть диалог / просмотрщик / панель', 'uk-UA': 'Закрити діалог / переглядач / панель',
    'pl-PL': 'Zamknij okno / podgląd / panel', 'cs-CZ': 'Zavřít dialog / prohlížeč / panel',
    'tr-TR': 'İletişim kutusunu / görüntüleyiciyi / paneli kapat', 'sv-SE': 'Stäng dialog / visare / panel',
    'da-DK': 'Luk dialogboks / fremviser / panel', 'bg-BG': 'Затваряне на диалог / преглед / панел',
    'hr-HR': 'Zatvori dijalog / preglednik / panel', 'sr-Latn': 'Zatvori dijalog / pregledač / panel',
    'id-ID': 'Tutup dialog / penampil / panel', 'af-ZA': 'Sluit dialoog / kyker / paneel',
  },
  'settings.occupied.confirmDelete': {
    'zh-CN': '确认删除', 'zh-TW': '確認刪除',
    'en-US': 'Confirm deletion', 'en-GB': 'Confirm deletion',
    'ja-JP': '削除を確定', 'ko-KR': '삭제 확인',
    'de-DE': 'Löschen bestätigen', 'fr-FR': 'Confirmer la suppression',
    'es-ES': 'Confirmar eliminación', 'it-IT': 'Conferma eliminazione',
    'pt-BR': 'Confirmar exclusão', 'pt-PT': 'Confirmar eliminação',
    'ru-RU': 'Подтвердить удаление', 'uk-UA': 'Підтвердити видалення',
    'pl-PL': 'Potwierdź usunięcie', 'cs-CZ': 'Potvrdit smazání',
    'tr-TR': 'Silmeyi onayla', 'sv-SE': 'Bekräfta borttagning',
    'da-DK': 'Bekræft sletning', 'bg-BG': 'Потвърждаване на изтриването',
    'hr-HR': 'Potvrdi brisanje', 'sr-Latn': 'Potvrdi brisanje',
    'id-ID': 'Konfirmasi penghapusan', 'af-ZA': 'Bevestig skraping',
  },
}

/** 既有 key 的文案更新（仅列出需要改的语言，其余保持原译） */
const UPDATE_KEYS = {
  // 下列 3 条原本就是「快捷键」措辞，但部分语言译成了「热键」字面（Hotkey / ホットキー /
  // Горячая клавиша / Гаряча клавіша / Hastetast / Sneltoets），此处统一为「快捷键」。
  'settings.hotkeyUnbound': {
    'en-US': 'Set shortcut',
    'en-GB': 'Set shortcut',
    'ja-JP': 'ショートカットキーを設定',
    'ru-RU': 'Установить комбинацию клавиш',
    'uk-UA': 'Встановити комбінацію клавіш',
    'da-DK': 'Sæt genvej',
    'af-ZA': 'Stel kortpad',
  },
  'settings.hotkeyConflictConfirm': {
    'en-US': 'Shortcut {keys} is already used by: {names}\nBind it to SFTP+ anyway? (Both may fire.)',
    'en-GB': 'Shortcut {keys} is already used by: {names}\nBind it to SFTP+ anyway? (Both may fire.)',
    'ja-JP': 'ショートカットキー {keys} は既に {names} で使用されています。\nそれでも SFTP+ に割り当てますか？（両方が発火する可能性があります。）',
    'ru-RU': 'Комбинация клавиш {keys} уже используется: {names}\nВсё равно назначить её SFTP+? (Могут сработать обе.)',
    'uk-UA': 'Комбінацію клавіш {keys} вже використовує: {names}\nУсе одно призначити її SFTP+? (Можуть спрацювати обидві.)',
    'da-DK': 'Genvejstast {keys} er allerede brugt af: {names}\nBind den til SFTP+ alligevel? (Begge kan aktiveres.)',
    'af-ZA': 'Kortpad {keys} word reeds gebruik deur: {names}\nBind dit niettemin aan SFTP+? (Albei kan aktiveer.)',
  },
  'settings.hotkeyCleared': {
    'en-US': 'Shortcut binding cleared',
    'en-GB': 'Shortcut binding cleared',
    'ja-JP': 'ショートカットキーの割り当てをクリアしました',
    'ru-RU': 'Назначение комбинации клавиш очищено',
    'uk-UA': 'Прив’язку комбінації клавіш очищено',
    'da-DK': 'Genvejsbinding ryddet',
    'af-ZA': 'Kortpadbinding gekanselleer',
  },
  'settings.hotkeys': {
    'zh-CN': '快捷键',
    'zh-TW': '快捷鍵',
    'en-US': 'Shortcuts',
    'en-GB': 'Shortcuts',
    'ja-JP': 'ショートカットキー',
    'ru-RU': 'Комбинации клавиш',
    'uk-UA': 'Комбінації клавіш',
    'da-DK': 'Genvejstaster',
    'sv-SE': 'Genvägstangenter',
    'af-ZA': 'Kortpaaie',
  },
  'settings.panelHotkeyConflict': {
    'zh-CN': '快捷键 {keys} 已被其它动作占用',
    'zh-TW': '快捷鍵 {keys} 已被其它動作占用',
    'en-US': 'Shortcut {keys} is already used by another action',
    'en-GB': 'Shortcut {keys} is already used by another action',
    'ja-JP': 'ショートカットキー {keys} は別の操作ですでに使用されています',
    'ru-RU': 'Комбинация клавиш {keys} уже используется другим действием',
    'uk-UA': 'Комбінацію клавіш {keys} вже використовує інша дія',
    'da-DK': 'Genvejstast {keys} bruges allerede af en anden handling',
    'sv-SE': 'Genvägstangent {keys} används redan av en annan åtgärd',
    'af-ZA': 'Kortpad {keys} word reeds deur \'n ander aksie gebruik',
  },
}

function poEscape(s) {
  // 用 \u0000 作占位符保护字面 \n（.po 的换行转义序列），避免被下面的反斜杠转义破坏；最后还原
  return String(s)
    .replace(/\r/g, '')
    .replace(/\\n/g, '\u0000')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\u0000/g, '\\n')
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasKey(txt, key) {
  return new RegExp(`^msgid\\s+"${escRe(key)}"\\s*$`, 'm').test(txt)
}

/** 替换既有 msgid 块的 msgstr（单行 msgstr） */
function replaceMsgstr(txt, key, val) {
  const re = new RegExp(`(^msgid\\s+"${escRe(key)}"\\s*\\nmsgstr\\s+")([^"]*)(")`, 'm')
  return re.test(txt) ? txt.replace(re, `$1${poEscape(val)}$3`) : txt
}

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po')).sort()
let added = 0
let updated = 0

for (const file of files) {
  const lang = file.replace(/\.po$/, '')
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')

  // 1) 更新既有文案
  for (const [key, perLang] of Object.entries(UPDATE_KEYS)) {
    const val = perLang[lang]
    if (!val) continue
    if (!hasKey(txt, key)) continue
    const next = replaceMsgstr(txt, key, val)
    if (next !== txt) { txt = next; updated++ }
  }

  // 2) 追加缺失的新 key
  const blocks = []
  for (const [key, perLang] of Object.entries(NEW_KEYS)) {
    const val = perLang[lang] ?? perLang['en-US']
    if (!val || hasKey(txt, key)) continue
    blocks.push(`\nmsgid "${key}"\nmsgstr "${poEscape(val)}"\n`)
  }
  if (blocks.length) {
    if (!txt.endsWith('\n')) txt += '\n'
    txt += blocks.join('')
    added += blocks.length
  }

  fs.writeFileSync(full, txt, 'utf8')
}

console.log(`[i18n] 更新文案 ${updated} 处，追加新 key ${added} 条，处理 ${files.length} 个语言文件`)
