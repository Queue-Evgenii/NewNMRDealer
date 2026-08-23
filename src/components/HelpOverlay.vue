<script setup lang="ts">
defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="sheet">
      <h2>Как это работает</h2>
      <p class="lead">
        Это конструктор натяжного потолка. Вы рисуете форму комнаты сверху (вид с потолка),
        а программа считает материал и раскрой.
      </p>

      <ol class="steps">
        <li><b>Задайте форму.</b> Нажмите «Новый потолок» и введите ширину и длину комнаты
          в миллиметрах — появится прямоугольник.</li>
        <li><b>Подгоните углы.</b> Тяните точки мышью или пальцем. Точные размеры вводите
          в панели справа (X, Y или длина стороны).</li>
        <li><b>Отметьте стороны.</b> Кликните по стороне и включите <b>Гарпун</b> (крепёж по периметру)
          или <b>Шов</b> (спайка двух полотен).</li>
        <li><b>Смотрите расчёт.</b> Справа сразу считаются площадь, периметр, диагонали,
          длина гарпуна и раскрой полотна с учётом усадки.</li>
        <li><b>3D-вид.</b> Вкладка сверху показывает потолок объёмно.</li>
      </ol>

      <div class="terms">
        <div><b>Гарпун</b> — гибкий профиль по краю полотна, которым оно крепится к стене.</div>
        <div><b>Усадка</b> — полотно кроят меньше комнаты на несколько %, оно натягивается при нагреве.</div>
        <div><b>Шов / спайка</b> — если комната шире рулона, два полотна сваривают в одно.</div>
      </div>

      <h3 class="kbd-h">Горячие клавиши</h3>
      <div class="kbd">
        <div><kbd>Ctrl</kbd>+<kbd>Z</kbd> отмена · <kbd>Ctrl</kbd>+<kbd>Y</kbd> повтор</div>
        <div><kbd>V</kbd> выбор · <kbd>A</kbd> добавить · <kbd>R</kbd> линейка · <kbd>H</kbd> рука</div>
        <div><kbd>G</kbd> сетка · <kbd>M</kbd> размеры · <kbd>C</kbd> контур · <kbd>Del</kbd> удалить · <kbd>Esc</kbd> снять выделение</div>
      </div>

      <button class="ok" @click="$emit('close')">Понятно</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(6, 10, 18, 0.75);
  display: flex; align-items: center; justify-content: center; z-index: 60; padding: 16px;
}
.sheet {
  width: 520px; max-width: 100%; max-height: 90vh; overflow-y: auto;
  background: #141c2e; border: 1px solid #263250; border-radius: 14px; padding: 24px;
}
h2 { margin: 0 0 8px; }
.lead { color: #c3d0e8; font-size: 14px; margin: 0 0 16px; }
.steps { margin: 0 0 18px; padding-left: 20px; color: #cbd5e1; font-size: 14px; }
.steps li { margin-bottom: 9px; line-height: 1.4; }
.terms { display: grid; gap: 8px; background: #0f1728; border: 1px solid #263250; border-radius: 10px; padding: 14px; font-size: 13px; color: #a9b8d4; }
.kbd-h { margin: 16px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8fa3c4; }
.kbd { display: grid; gap: 6px; font-size: 13px; color: #a9b8d4; }
kbd {
  display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 12px;
  background: #0d1320; border: 1px solid #2a3550; color: #cbd5e1;
}
.ok {
  margin-top: 18px; width: 100%; padding: 11px; border-radius: 9px; cursor: pointer;
  background: #2f6fed; border: none; color: #fff; font-size: 15px; font-weight: 600;
}
</style>
