// Компоненты конструктора используют useI18n — плагин нужен любому монтированию.
import { config } from '@vue/test-utils'
import { i18n } from '../src/i18n'

config.global.plugins = [i18n]
