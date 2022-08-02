# OSK-hangul

OSK-hangul is a Gnome Shell extension that supports On-Screen Keyboard for Korean users.

# features
- Supports Ibus and Nimf that use libhangul as its engine
- Modifies appearance of original keyboard to be more friendly to Korean user(ex. 한/영 button)

# dependency
- Dependencies of Gnome Shell On-Screen Keyboard
- Nimf

# Development Guide
**Please read this section before you modify the code.**

## Input Method
- The source codes are written under the assumption that the developer understands basics and characteristics of Input Methods. If you do not have any relayed knowledge, the links below will be helpful
  - [](https://www.ibm.com/docs/en/aix/7.1?topic=methods-input-method-introduction)
  - [](https://ko.wikipedia.org/wiki/%EC%9E%85%EB%A0%A5%EA%B8%B0)
- Also, since this extension modifies some functionalties of Gnome Shell On-Screen Keyboard, so you can't understand the keyboard by reading only this code. Please refer to the original code of Gnome Shell. Below is a list of related source code.
  - js/ui/keyboard.js
  - js/ui/status/keyboard.js
  - js/misc/inputMethod.js
  - js/misc/ibusManager.js

## styling
- OSK-hangul uses SCSS to apply the style instead of CSS. Do not commit stylesheet.css file. It is created when building this extension.
- Do not apply 'color' property on pseudo class of St.Icon(and other elements that causes Gicon). This causes touch problems on the element.
  - For example, original Gnome Shell applied different color scheme for every pseudo class of enter key. If user touches that key, motion, press, release event occur in succession. The motion event changes color of the enter-key icon. And GIcon is reloaded by St.Icon. As the GIcon is reloaded, in turn, the queue-relayout is called, and the enter-key is queued. The next event, press, is ignored because the actor in the queue cannot receive the event. As the ignored press event reaches another actor, the keyboard is hidden.
