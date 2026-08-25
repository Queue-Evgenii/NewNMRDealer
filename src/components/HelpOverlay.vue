<script setup lang="ts">
import { IconSelect, IconDraw, IconRuler, IconMeasure } from '../icons'

defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="sheet">
      <h2>Как это работает</h2>
      <p class="lead">
        Конструктор натяжного потолка: вы задаёте форму комнаты сверху, программа считает
        материал, раскрой и стоимость. Управление устроено как в графических редакторах —
        сначала выбираете режим, потом работаете.
      </p>

      <h3 class="h">Четыре режима</h3>
      <div class="terms">
        <div><b><IconSelect :size="15" :stroke-width="1.75" /> Выбор</b> — единственный режим,
          где меняется геометрия: выделять, тянуть углы, стороны и фигуры целиком.</div>
        <div><b><IconDraw :size="15" :stroke-width="1.75" /> Рисовать</b> — новый контур по точкам.
          Точки идут только в него, ничего постороннего клик не создаёт.</div>
        <div><b><IconRuler :size="15" :stroke-width="1.75" /> Линейка</b> — два тапа, между ними расстояние.</div>
        <div><b><IconMeasure :size="15" :stroke-width="1.75" /> Замер</b> — построение по методу треугольников.</div>
      </div>
      <p class="note">
        В режимах «Рисовать», «Линейка» и «Замер» перетаскивание всегда двигает холст —
        случайно испортить чертёж нельзя.
      </p>

      <h3 class="h">Жесты — одинаковые везде</h3>
      <div class="terms">
        <div><b>Тяга по пустому месту</b> — двигать холст. <b>Два пальца</b> — двигать и
          масштабировать. Колесо мыши — масштаб. Пробел — временная «рука».</div>
        <div><b>Тап</b> — выделить: угол, сторону или фигуру. Тап по пустому — снять выделение.</div>
        <div><b>Ручка «+» на середине стороны</b> — врезать новый угол. Тяните её сразу —
          угол появится и поедет за пальцем.</div>
        <div><b>Угол на угол</b> — если подвести вершину к соседней, они сварятся в одну
          (зелёное кольцо — предупреждение).</div>
      </div>

      <h3 class="h">Замер по треугольникам</h3>
      <p class="lead">
        Углы на объекте не меряют — только длины. Комнату разбивают на треугольники:
        по трём сторонам треугольник строится однозначно, поэтому контур собирается
        из размеров сам.
      </p>
      <ol class="steps">
        <li><b>Первый треугольник</b> — три длины: основание и две стороны от его концов.</li>
        <li><b>Дальше по цепочке:</b> тап по стороне — она становится основанием, вводите
          две длины до новой вершины.</li>
        <li>Мерили <b>из одной точки посреди комнаты</b> — стройте веером от неё: последний
          треугольник сам замкнёт контур, а точка замера останется внутри.</li>
        <li>Уже нарисованную фигуру можно <b>разбить на треугольники</b> одной кнопкой
          и выгрузить лист замера (CSV).</li>
      </ol>
      <p class="note">
        Программа не даст построить несуществующий треугольник и не даст треугольникам
        наложиться друг на друга. Если после замера двигать углы руками — панель честно
        предупредит, что длины больше не те, что диктовал замерщик.
      </p>

      <div class="terms">
        <div><b>Гарпун</b> — профиль по краю полотна, которым оно крепится к стене.</div>
        <div><b>Усадка</b> — полотно кроят меньше комнаты на несколько %, оно натягивается при нагреве.</div>
        <div><b>Шов / спайка</b> — если комната шире рулона, два полотна сваривают в одно.</div>
      </div>

      <h3 class="h">Клавиши</h3>
      <div class="kbd">
        <div><kbd>V</kbd> выбор · <kbd>D</kbd> рисовать · <kbd>R</kbd> линейка · <kbd>T</kbd> замер</div>
        <div><kbd>Enter</kbd> замкнуть контур · <kbd>Backspace</kbd> убрать точку · <kbd>Esc</kbd> выйти / снять выделение</div>
        <div><kbd>G</kbd> сетка · <kbd>M</kbd> размеры · <kbd>S</kbd> привязка · <kbd>C</kbd> контур · <kbd>Del</kbd> удалить</div>
        <div><kbd>Ctrl</kbd>+<kbd>Z</kbd> отмена · <kbd>Ctrl</kbd>+<kbd>Y</kbd> повтор · <kbd>Пробел</kbd> рука</div>
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
  width: 560px; max-width: 100%; max-height: 90vh; overflow-y: auto;
  background: #141c2e; border: 1px solid #263250; border-radius: 14px; padding: 24px;
}
h2 { margin: 0 0 8px; }
.h { margin: 18px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8fa3c4; }
.lead { color: #c3d0e8; font-size: 14px; margin: 0 0 14px; line-height: 1.5; }
.note { font-size: 13px; color: #8fa3c4; line-height: 1.5; margin: 10px 0 0; }
.steps { margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 14px; }
.steps li { margin-bottom: 8px; line-height: 1.45; }
.terms { display: grid; gap: 9px; background: #0f1728; border: 1px solid #263250; border-radius: 10px; padding: 14px; font-size: 13px; color: #a9b8d4; line-height: 1.45; }
.terms b { color: #dbe6ff; }
.terms b svg { vertical-align: -2px; }
.kbd { display: grid; gap: 6px; font-size: 13px; color: #a9b8d4; }
kbd {
  display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 12px;
  background: #0d1320; border: 1px solid #2a3550; color: #cbd5e1;
}
.ok {
  margin-top: 20px; width: 100%; padding: 12px; border-radius: 9px; cursor: pointer;
  background: #2f6fed; border: none; color: #fff; font-size: 15px; font-weight: 600;
}
</style>
