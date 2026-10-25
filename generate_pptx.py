import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from PIL import Image

# Initialize presentation
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# Color Palette
COLOR_BG = RGBColor(11, 17, 32)         # Very dark slate #0b1120
COLOR_CARD = RGBColor(22, 30, 49)       # Dark card #161e31
COLOR_CARD_BORDER = RGBColor(38, 51, 79) # Border #26334f
COLOR_TEXT_WHITE = RGBColor(255, 255, 255)
COLOR_TEXT_MUTED = RGBColor(156, 163, 175) # #9ca3af
COLOR_TEXT_DIM = RGBColor(107, 114, 128)  # #6b7280
COLOR_BLUE = RGBColor(59, 130, 246)       # #3b82f6
COLOR_GREEN = RGBColor(16, 185, 129)     # #10b981
COLOR_PURPLE = RGBColor(139, 92, 246)    # #8b5cf6
COLOR_AMBER = RGBColor(245, 158, 11)     # #f59e0b

FONT_FAMILY = "Segoe UI"

def set_slide_background(slide):
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = COLOR_BG

def add_header(slide, badge_text, badge_color, action_title, subtitle=""):
    # Badge shape
    badge_box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.55), Inches(2.6), Inches(0.38))
    badge_box.fill.solid()
    badge_box.fill.fore_color.rgb = RGBColor(badge_color[0] // 4, badge_color[1] // 4, badge_color[2] // 4)
    badge_box.line.color.rgb = badge_color
    badge_box.line.width = Pt(1)
    
    tf = badge_box.text_frame
    tf.word_wrap = False
    tf.margin_top = Inches(0.04)
    tf.margin_bottom = Inches(0.04)
    tf.margin_left = Inches(0.1)
    tf.margin_right = Inches(0.1)
    p = tf.paragraphs[0]
    p.text = badge_text.upper()
    p.alignment = PP_ALIGN.CENTER
    p.font.name = FONT_FAMILY
    p.font.size = Pt(10)
    p.font.bold = True
    p.font.color.rgb = badge_color

    # Action Title
    title_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.02), Inches(11.7), Inches(0.65))
    tf_t = title_box.text_frame
    tf_t.word_wrap = True
    tf_t.margin_top = 0
    tf_t.margin_bottom = 0
    tf_t.margin_left = 0
    tf_t.margin_right = 0
    p_t = tf_t.paragraphs[0]
    p_t.text = action_title
    p_t.font.name = FONT_FAMILY
    p_t.font.size = Pt(22)
    p_t.font.bold = True
    p_t.font.color.rgb = COLOR_TEXT_WHITE

    if subtitle:
        p_sub = tf_t.add_paragraph()
        p_sub.text = subtitle
        p_sub.font.name = FONT_FAMILY
        p_sub.font.size = Pt(13)
        p_sub.font.color.rgb = COLOR_TEXT_MUTED
        p_sub.space_before = Pt(4)

def add_card(slide, left, top, width, height, title, desc, icon=""):
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card.fill.solid()
    card.fill.fore_color.rgb = COLOR_CARD
    card.line.color.rgb = COLOR_CARD_BORDER
    card.line.width = Pt(1)

    tf = card.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.25)
    tf.margin_right = Inches(0.25)
    tf.margin_top = Inches(0.2)
    tf.margin_bottom = Inches(0.2)

    p_title = tf.paragraphs[0]
    p_title.text = f"{icon}  {title}" if icon else title
    p_title.font.name = FONT_FAMILY
    p_title.font.size = Pt(13)
    p_title.font.bold = True
    p_title.font.color.rgb = COLOR_TEXT_WHITE

    p_desc = tf.add_paragraph()
    p_desc.text = desc
    p_desc.font.name = FONT_FAMILY
    p_desc.font.size = Pt(11)
    p_desc.font.color.rgb = COLOR_TEXT_MUTED
    p_desc.space_before = Pt(6)

def add_image_with_frame(slide, img_path, left, top, max_width, max_height, caption=""):
    if not os.path.exists(img_path):
        return
    
    with Image.open(img_path) as im:
        img_w, img_h = im.size
    
    aspect = img_w / img_h
    target_aspect = max_width / max_height

    if aspect > target_aspect:
        draw_w = max_width
        draw_h = max_width / aspect
    else:
        draw_h = max_height
        draw_w = max_height * aspect
    
    draw_left = left + (max_width - draw_w) / 2
    draw_top = top + (max_height - draw_h) / 2

    # Frame background
    bg_frame = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, draw_left - Inches(0.08), draw_top - Inches(0.08), draw_w + Inches(0.16), draw_h + Inches(0.16))
    bg_frame.fill.solid()
    bg_frame.fill.fore_color.rgb = RGBColor(18, 24, 38)
    bg_frame.line.color.rgb = COLOR_CARD_BORDER
    bg_frame.line.width = Pt(1.5)

    # Add Picture
    slide.shapes.add_picture(img_path, draw_left, draw_top, width=draw_w, height=draw_h)

    # Caption if present
    if caption:
        cap_box = slide.shapes.add_textbox(draw_left, draw_top + draw_h + Inches(0.12), draw_w, Inches(0.3))
        tf = cap_box.text_frame
        tf.margin_top = 0
        tf.margin_left = 0
        p = tf.paragraphs[0]
        p.text = caption
        p.alignment = PP_ALIGN.CENTER
        p.font.name = FONT_FAMILY
        p.font.size = Pt(10)
        p.font.color.rgb = COLOR_TEXT_DIM

blank_layout = prs.slide_layouts[6]

# ==========================================
# СЛАЙД 1: ГЛАВНАЯ ИДЕЯ
# ==========================================
s1 = prs.slides.add_slide(blank_layout)
set_slide_background(s1)

# Badge
b1 = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(4.8), Inches(1.1), Inches(3.73), Inches(0.42))
b1.fill.solid()
b1.fill.fore_color.rgb = RGBColor(14, 32, 64)
b1.line.color.rgb = COLOR_BLUE
b1.line.width = Pt(1)
tf_b1 = b1.text_frame
p = tf_b1.paragraphs[0]
p.text = "КОНЦЕПЦИЯ И МИССИЯ РЕШЕНИЯ"
p.alignment = PP_ALIGN.CENTER
p.font.name = FONT_FAMILY
p.font.size = Pt(11)
p.font.bold = True
p.font.color.rgb = COLOR_BLUE

# Title
t1 = s1.shapes.add_textbox(Inches(1.2), Inches(1.75), Inches(10.93), Inches(1.6))
tf_t1 = t1.text_frame
tf_t1.word_wrap = True
p1 = tf_t1.paragraphs[0]
p1.text = "Понятная навигация внутри зданий без установки приложений"
p1.alignment = PP_ALIGN.CENTER
p1.font.name = FONT_FAMILY
p1.font.size = Pt(32)
p1.font.bold = True
p1.font.color.rgb = COLOR_TEXT_WHITE

p1_sub = tf_t1.add_paragraph()
p1_sub.text = "Посетитель наводит камеру смартфона на QR-код и за 1 секунду открывает интерактивную карту этажа прямо в браузере. Без очередей к информационным стойкам и потерянных минут."
p1_sub.alignment = PP_ALIGN.CENTER
p1_sub.font.name = FONT_FAMILY
p1_sub.font.size = Pt(14)
p1_sub.font.color.rgb = COLOR_TEXT_MUTED
p1_sub.space_before = Pt(12)

# 3 Pillars
card_w = Inches(3.64)
card_h = Inches(2.2)
top_y = Inches(4.3)
cards_data_1 = [
    ("⚡ Быстрый старт", "Работает на любом смартфоне или компьютере без скачивания приложений из App Store или Google Play.", Inches(0.8)),
    ("📍 Точный маршрут", "Пошаговое построение пути от входа до нужного кабинета или стенда с расчетом времени в пути.", Inches(4.84)),
    ("🛠️ Простой конструктор", "Организатор создает и правит схему помещения за 15 минут в интуитивном визуальном редакторе.", Inches(8.88))
]
for title, desc, left_pos in cards_data_1:
    add_card(s1, left_pos, top_y, card_w, card_h, title, desc)

# ==========================================
# СЛАЙД 2: ПАНЕЛЬ ОРГАНИЗАТОРА (СКРИНШОТ 3)
# ==========================================
s2 = prs.slides.add_slide(blank_layout)
set_slide_background(s2)
add_header(s2, "Центр управления", COLOR_PURPLE, "Панель организатора: все мероприятия и площадки под рукой", "Единое окно для управления событиями: запуск новых карт и разграничение доступа.")

items_s2 = [
    ("📋 Карточки мероприятий", "Наглядное разделение на статусы («Черновик» для работы команды или «Опубликована» для гостей)."),
    ("📍 Привязка к физическому адресу", "К каждому событию прикреплен точный физический адрес площадки для ориентации гостей."),
    ("🔒 Быстрый безопасный вход", "Кнопка «Я организатор» с оперативным вводом пароля (demo123) защищает карты от случайных правок.")
]
card_top = Inches(2.05)
for title, desc in items_s2:
    add_card(s2, Inches(0.8), card_top, Inches(5.4), Inches(1.4), title, desc)
    card_top += Inches(1.58)

add_image_with_frame(s2, "presentation_assets/screenshot3_dashboard.png", Inches(6.5), Inches(2.05), Inches(6.0), Inches(4.55), "Экран панели организатора со списком карточек и созданием карты")

# ==========================================
# СЛАЙД 3: КОНСТРУКТОР ПЛАНА (СКРИНШОТ 1)
# ==========================================
s3 = prs.slides.add_slide(blank_layout)
set_slide_background(s3)
add_header(s3, "Визуальный редактор", COLOR_BLUE, "Конструктор схемы: просто, как конструктор Lego", "Создание и редактирование помещений мышкой без необходимости изучать тяжелые CAD-программы.")

items_s3 = [
    ("📐 Сетка с шагом 1 метр", "Магнитная привязка стен и вершин гарантирует идеальную геометрию без кривых линий."),
    ("📦 Комнаты по площади (м²)", "Генерация комнаты нужного метража и свободное добавление вершин для сложных полигонов."),
    ("🚪 Архитектурные двери и проемы", "Выбор ширины (от 0.8 до 2.0 м), поворот на 90° и настройка открывания створок.")
]
card_top = Inches(2.05)
for title, desc in items_s3:
    add_card(s3, Inches(0.8), card_top, Inches(5.4), Inches(1.4), title, desc)
    card_top += Inches(1.58)

add_image_with_frame(s3, "presentation_assets/screenshot1_editor.png", Inches(6.5), Inches(2.05), Inches(6.0), Inches(4.55), "Интерфейс конструктора: координатная сетка, добавление комнат и дверей")

# ==========================================
# СЛАЙД 4: НАВИГАЦИЯ ГОСТЯ (СКРИНШОТ 4)
# ==========================================
s4 = prs.slides.add_slide(blank_layout)
set_slide_background(s4)
add_header(s4, "Опыт посетителя", COLOR_GREEN, "Навигация для гостя: маршрут за 1 клик", "Гость выбирает начальную и конечную точку — сервис мгновенно рисует маршрут по коридорам.")

items_s4 = [
    ("🚶 Четкая линия пути", "Например, «Главный вход → Лифт»: система пишет «1 мин пешком» и показывает траекторию движения."),
    ("🔍 Интерактивные карточки зон", "Клик по стенду или кабинету открывает название, описание и кнопку «Проложить маршрут сюда»."),
    ("📱 Плавный зум и перемещение", "Легкое управление жестами на экране смартфона или колесиком мыши на компьютере.")
]
card_top = Inches(2.05)
for title, desc in items_s4:
    add_card(s4, Inches(0.8), card_top, Inches(5.4), Inches(1.4), title, desc)
    card_top += Inches(1.58)

add_image_with_frame(s4, "presentation_assets/screenshot4_route.png", Inches(6.5), Inches(2.05), Inches(6.0), Inches(4.55), "Экран гостя: построенный путь «Главный вход → Лифт», 1 мин пешком")

# ==========================================
# СЛАЙД 5: АНАЛИТИКА И СТАТИСТИКА (СКРИНШОТ 2)
# ==========================================
s5 = prs.slides.add_slide(blank_layout)
set_slide_background(s5)
add_header(s5, "Аналитика площадки", COLOR_AMBER, "Реальная статистика: прозрачный интерес гостей", "Организатор и спонсоры видят объективные данные о посещаемости каждого стенда и зоны.")

items_s5 = [
    ("👁️ Счетчики просмотров и кликов", "Фиксация общего числа открытий карты, кликов по стендам и обращений к поиску пути."),
    ("📊 График динамики по дням", "Наглядный 14-дневный график активности показывает пиковые часы нагрузки на площадку."),
    ("🎯 Тепловая карта интереса", "Понимание, какие локации привлекают больше внимания, а какие требуют лучшей навигации.")
]
card_top = Inches(2.05)
for title, desc in items_s5:
    add_card(s5, Inches(0.8), card_top, Inches(5.4), Inches(1.4), title, desc)
    card_top += Inches(1.58)

add_image_with_frame(s5, "presentation_assets/screenshot2_stats.png", Inches(6.5), Inches(2.05), Inches(6.0), Inches(4.55), "Экран аналитики: счетчики просмотров, кликов и динамика за 14 дней")

# ==========================================
# СЛАЙД 6: ТЕХНОЛОГИЧЕСКИЙ СТЕК
# ==========================================
s6 = prs.slides.add_slide(blank_layout)
set_slide_background(s6)
add_header(s6, "Инженерная база", COLOR_PURPLE, "Технологический стек простыми словами", "Современные и проверенные технологии для высокой скорости и стабильности без оверинжиниринга.")

tech_items = [
    ("ФРОНТЕНД", "React 19 + Vite", "Моментальный запуск интерфейса за доли секунды, плавная анимация и работа без зависаний даже на бюджетных телефонах."),
    ("ОТРИСОВКА КАРТЫ", "Векторный SVG", "Четкие линии при любом приближении. Векторный файл карты весит в десятки раз меньше тяжелых картинок."),
    ("СЕРВЕР", "Python (FastAPI)", "Современный асинхронный сервер. Высокая скорость построения маршрутов и стабильная обработка запросов гостей."),
    ("БАЗА ДАННЫХ", "PostgreSQL", "Надежное промышленное хранилище для мероприятий, планов этажей, маршрутов и статистики посещений."),
    ("ОТКАЗОУСТОЙЧИВОСТЬ", "Резервный SQLite", "Автоматическое плавное переключение на встроенную локальную базу при работе на автономных стендах без Docker."),
    ("РАЗВЕРТЫВАНИЕ", "Docker", "Упаковка всего приложения в изолированные контейнеры. Запуск на любом сервере или ноутбуке одной командой.")
]

col_w = Inches(3.64)
row_h = Inches(2.15)
xs = [Inches(0.8), Inches(4.84), Inches(8.88)]
ys = [Inches(2.1), Inches(4.55)]

for i, (tag, title, desc) in enumerate(tech_items):
    col = i % 3
    row = i // 3
    left_p = xs[col]
    top_p = ys[row]

    card = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_p, top_p, col_w, row_h)
    card.fill.solid()
    card.fill.fore_color.rgb = COLOR_CARD
    card.line.color.rgb = COLOR_CARD_BORDER
    card.line.width = Pt(1)

    tf = card.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.25)
    tf.margin_right = Inches(0.25)
    tf.margin_top = Inches(0.2)
    tf.margin_bottom = Inches(0.2)

    p_tag = tf.paragraphs[0]
    p_tag.text = tag
    p_tag.font.name = FONT_FAMILY
    p_tag.font.size = Pt(9)
    p_tag.font.bold = True
    p_tag.font.color.rgb = COLOR_BLUE

    p_name = tf.add_paragraph()
    p_name.text = title
    p_name.font.name = FONT_FAMILY
    p_name.font.size = Pt(14)
    p_name.font.bold = True
    p_name.font.color.rgb = COLOR_TEXT_WHITE
    p_name.space_before = Pt(3)

    p_d = tf.add_paragraph()
    p_d.text = desc
    p_d.font.name = FONT_FAMILY
    p_d.font.size = Pt(10)
    p_d.font.color.rgb = COLOR_TEXT_MUTED
    p_d.space_before = Pt(6)

# ==========================================
# СЛАЙД 7: ИТОГОВАЯ ЦЕННОСТЬ
# ==========================================
s7 = prs.slides.add_slide(blank_layout)
set_slide_background(s7)
add_header(s7, "Эффект от внедрения", COLOR_GREEN, "Главный результат: выигрывают все", "Проект решает задачи комплексно — и для организатора, и для посетителей, и для площадки.")

value_cards = [
    ("👔 Для организатора", "15 минут", [
        "План площадки готов без найма дизайнеров и чертежников.",
        "Мгновенные правки на ходу: переставили стол — карта сразу обновилась.",
        "Не нужно печатать тысячи бумажных буклетов, которые выбрасывают."
    ], COLOR_BLUE),
    ("🚶 Для посетителя", "0 секунд", [
        "Не требуется скачивать приложения или проходить регистрацию.",
        "Понятная стрелка маршрута прямо от входа к нужной цели.",
        "Точное знание времени в пути — никаких опозданий на лекции и встречи."
    ], COLOR_GREEN),
    ("🏢 Для площадки", "100% данных", [
        "Честная статистика просмотров и кликов по каждому партнеру.",
        "Снижение нагрузки на администраторов и службу безопасности.",
        "Повышение статуса мероприятия за счет цифрового сервиса."
    ], COLOR_PURPLE)
]

val_col_w = Inches(3.64)
val_col_h = Inches(4.6)
val_top = Inches(2.1)

for i, (role, metric, bullets, accent_c) in enumerate(value_cards):
    left_p = xs[i]
    card = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_p, val_top, val_col_w, val_col_h)
    card.fill.solid()
    card.fill.fore_color.rgb = COLOR_CARD
    card.line.color.rgb = COLOR_CARD_BORDER
    card.line.width = Pt(1)

    tf = card.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.3)
    tf.margin_right = Inches(0.3)
    tf.margin_top = Inches(0.3)
    tf.margin_bottom = Inches(0.3)

    p_role = tf.paragraphs[0]
    p_role.text = role
    p_role.font.name = FONT_FAMILY
    p_role.font.size = Pt(15)
    p_role.font.bold = True
    p_role.font.color.rgb = COLOR_TEXT_WHITE

    p_met = tf.add_paragraph()
    p_met.text = metric
    p_met.font.name = FONT_FAMILY
    p_met.font.size = Pt(28)
    p_met.font.bold = True
    p_met.font.color.rgb = accent_c
    p_met.space_before = Pt(8)
    p_met.space_after = Pt(12)

    for bullet in bullets:
        p_b = tf.add_paragraph()
        p_b.text = f"•  {bullet}"
        p_b.font.name = FONT_FAMILY
        p_b.font.size = Pt(11)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(6)

output_path = "presentation.pptx"
prs.save(output_path)
print(f"Presentation saved successfully to {os.path.abspath(output_path)} ({os.path.getsize(output_path)} bytes)")
