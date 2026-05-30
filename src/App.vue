<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import { useThemeStore } from './stores/theme'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const unsupportedBannerDismissKey = 'pwa-unsupported-banner-dismissed'

const deferredInstallPrompt = ref<BeforeInstallPromptEvent | null>(null)
const installError = ref<string | null>(null)
const isInstalling = ref(false)
const isStandalone = ref(false)
const isIosManualInstall = ref(false)
const isUnsupportedBrowser = ref(false)
const isInstallBannerDismissed = ref(false)
const isUnsupportedBannerDismissed = ref(false)

let displayModeQuery: MediaQueryList | null = null

// Initialise on app start so the stored preference is applied immediately.
useThemeStore()

const bannerMode = computed<'hidden' | 'install' | 'manual' | 'unsupported'>(() => {
  if (isStandalone.value) {
    return 'hidden'
  }

  if (deferredInstallPrompt.value && !isInstallBannerDismissed.value) {
    return 'install'
  }

  if (isIosManualInstall.value && !isInstallBannerDismissed.value) {
    return 'manual'
  }

  if (isUnsupportedBrowser.value && !isUnsupportedBannerDismissed.value) {
    return 'unsupported'
  }

  return 'hidden'
})

const bannerTitle = computed(() => {
  switch (bannerMode.value) {
    case 'install':
      return 'Install ProxiedMail'
    case 'manual':
      return 'Install ProxiedMail manually'
    case 'unsupported':
      return 'This browser does not support installing this app'
    default:
      return ''
  }
})

const bannerMessage = computed(() => {
  switch (bannerMode.value) {
    case 'install':
      return 'Install this app for a standalone experience and faster repeat launches.'
    case 'manual':
      return 'Use Safari\'s Share menu and choose "Add to Home Screen" to install this app.'
    case 'unsupported':
      return 'Open ProxiedMail in a supported browser such as Chrome, Edge, or Safari to install it as an app.'
    default:
      return ''
  }
})

function detectStandaloneMode() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
  )
}

function detectIosManualInstallSupport() {
  const userAgent = window.navigator.userAgent
  const platform = window.navigator.platform
  const isAppleMobileDevice = /iPad|iPhone|iPod/.test(userAgent)
  const isMacTouchDevice = platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
  const isWebKitBrowser = /WebKit/.test(userAgent)
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS/.test(userAgent)

  return (isAppleMobileDevice || isMacTouchDevice) && isWebKitBrowser && !isOtherIosBrowser
}

function detectUnsupportedBrowser() {
  const userAgent = window.navigator.userAgent
  const isChromiumFamily = /Chrome|Chromium|Edg|OPR|SamsungBrowser/.test(userAgent)
  const isDesktopSafari = /Safari/.test(userAgent) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(userAgent)

  return !isChromiumFamily && !isIosManualInstall.value && !isDesktopSafari
}

function syncInstallState() {
  isStandalone.value = detectStandaloneMode()
  isIosManualInstall.value = detectIosManualInstallSupport()
  isUnsupportedBrowser.value = !isStandalone.value && detectUnsupportedBrowser()
}

function handleBeforeInstallPrompt(event: Event) {
  event.preventDefault()
  deferredInstallPrompt.value = event as BeforeInstallPromptEvent
  installError.value = null
}

function handleInstalled() {
  deferredInstallPrompt.value = null
  installError.value = null
  isStandalone.value = true
  isInstallBannerDismissed.value = false
}

function handleDismiss() {
  if (bannerMode.value === 'unsupported') {
    isUnsupportedBannerDismissed.value = true
    localStorage.setItem(unsupportedBannerDismissKey, 'true')
    return
  }

  isInstallBannerDismissed.value = true
}

async function handleInstall() {
  if (!deferredInstallPrompt.value) {
    return
  }

  isInstalling.value = true
  installError.value = null

  try {
    await deferredInstallPrompt.value.prompt()
    const choice = await deferredInstallPrompt.value.userChoice

    if (choice.outcome === 'dismissed') {
      installError.value = 'Installation was dismissed. You can try again from the browser menu.'
    }
  } finally {
    deferredInstallPrompt.value = null
    isInstalling.value = false
  }
}

function handleDisplayModeChange(event: MediaQueryListEvent) {
  isStandalone.value = event.matches
}

onMounted(() => {
  isUnsupportedBannerDismissed.value = localStorage.getItem(unsupportedBannerDismissKey) === 'true'
  syncInstallState()

  displayModeQuery = window.matchMedia('(display-mode: standalone)')
  displayModeQuery.addEventListener('change', handleDisplayModeChange)

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleInstalled)
})

onBeforeUnmount(() => {
  displayModeQuery?.removeEventListener('change', handleDisplayModeChange)
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.removeEventListener('appinstalled', handleInstalled)
})
</script>

<template>
  <div class="app-shell">
    <aside v-if="bannerMode !== 'hidden'" class="pwa-banner" role="status" aria-live="polite">
      <div class="pwa-banner__copy">
        <p class="pwa-banner__title">{{ bannerTitle }}</p>
        <p class="pwa-banner__message">{{ bannerMessage }}</p>
        <p v-if="installError" class="pwa-banner__message pwa-banner__message--error">
          {{ installError }}
        </p>
      </div>

      <div class="pwa-banner__actions">
        <button
          v-if="bannerMode === 'install'"
          class="pwa-banner__button pwa-banner__button--primary"
          type="button"
          :disabled="isInstalling"
          @click="handleInstall"
        >
          {{ isInstalling ? 'Installing...' : 'Install app' }}
        </button>
        <button class="pwa-banner__button" type="button" @click="handleDismiss">
          Dismiss
        </button>
      </div>
    </aside>

    <main class="app-shell__content">
      <RouterView />
    </main>
  </div>
</template>
