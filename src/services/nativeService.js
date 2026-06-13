import { StatusBar, Style } from '@capacitor/status-bar'
import { App } from '@capacitor/app'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Keyboard } from '@capacitor/keyboard'
import { Capacitor } from '@capacitor/core'

export const native = {
  isNative: Capacitor.isNativePlatform(),

  async init() {
    if (!this.isNative) return
    try {
      await StatusBar.setBackgroundColor({ color: '#0F172A' })
      await StatusBar.setStyle({ style: Style.Dark })
    } catch (e) {}

    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back()
      else App.exitApp()
    })

    Keyboard.addListener('keyboardWillShow', () => {
      document.body.classList.add('keyboard-open')
    })
    Keyboard.addListener('keyboardWillHide', () => {
      document.body.classList.remove('keyboard-open')
    })
  },

  async vibrate() {
    if (!this.isNative) return
    await Haptics.impact({ style: ImpactStyle.Light })
  },
}
