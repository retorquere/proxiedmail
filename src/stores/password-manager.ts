import { defineStore } from 'pinia'
import { ref } from 'vue'

const PASSWORD_MANAGER_KEY = 'password_manager_enabled'

export const usePasswordManagerStore = defineStore('password-manager', () => {
  const enabled = ref(localStorage.getItem(PASSWORD_MANAGER_KEY) === 'true')

  function setEnabled(value: boolean) {
    enabled.value = value
    localStorage.setItem(PASSWORD_MANAGER_KEY, String(value))
  }

  return { enabled, setEnabled }
})
