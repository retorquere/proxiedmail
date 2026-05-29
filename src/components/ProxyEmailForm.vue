<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Check, Copy, ExternalLink, Eye, EyeOff, Plus, RefreshCw, Save, X } from '@lucide/vue'
import type { ProxyBinding, ProxyBindingContact, RealAddress } from '../types/proxy-binding'
import { usePasswordManagerStore } from '../stores/password-manager'
import { apiFetch } from '../utils/api'
import { makeLocalPart } from '../utils/generate'

const props = defineProps<
  { binding?: ProxyBinding; knownAddresses?: string[]; knownDomains?: string[] }
>()
const emit = defineEmits<
  { (e: 'saved', id?: string): void; (e: 'cancel'): void }
>()

const { t } = useI18n()
const passwordManagerStore = usePasswordManagerStore()

const isEdit = !!props.binding?.id

// In create mode, proxy_address is split into localPart + domain
const existingProxyAddress = props.binding?.proxy_address ?? ''
const proxy_address = ref(existingProxyAddress) // used in edit mode display only
const localPart = ref(isEdit ? '' : makeLocalPart())
const domain = ref(props.knownDomains?.[0] ?? '')
const description = ref(props.binding?.description ?? '')
// For edit: local copy of real_addresses to toggle is_enabled
const editRealAddresses = ref<Record<string, RealAddress>>(
  JSON.parse(JSON.stringify(props.binding?.real_addresses ?? {})),
)
const selectedAddresses = ref<string[]>([])
const inputValue = ref('')
const showDropdown = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const contacts = ref<ProxyBindingContact[]>([])
const contactsLoading = ref(false)
const contactsError = ref<string | null>(null)
const newContactEmail = ref('')
const newContactDescription = ref('')
const pendingContacts = ref<Array<{ email: string; description: string }>>([])
const copiedContactId = ref<string | null>(null)
const copiedPassword = ref(false)
const passwordManagerLoading = ref(false)
const passwordManagerError = ref<string | null>(null)
const passwordDataLoadedFor = ref<string | null>(null)

const password = ref('')
const websiteUrl = ref('')
const pwLength = ref(16)
const pwLetters = ref(true)
const pwNumbers = ref(true)
const pwSymbols = ref(true)
const showPassword = ref(false)

const passwordManagerEnabled = computed(() => passwordManagerStore.enabled)

function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) return trimmed
  if (/^[a-z\d.-]+(?::\d+)?(?:[/?#]|$)/i.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

const websiteHref = computed(() => normalizeWebsiteUrl(websiteUrl.value))

function generatePassword() {
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numbers = '0123456789'
  const symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?'
  let charset = ''
  if (pwLetters.value) charset += letters
  if (pwNumbers.value) charset += numbers
  if (pwSymbols.value) charset += symbols
  if (!charset) return
  const buf = new Uint32Array(pwLength.value)
  crypto.getRandomValues(buf)
  password.value = Array.from(buf, x => charset[x % charset.length]).join('')
}

function addToPending() {
  const email = newContactEmail.value.trim()
  if (!email) return
  pendingContacts.value.push({ email, description: newContactDescription.value.trim() })
  newContactEmail.value = ''
  newContactDescription.value = ''
}

function removePending(index: number) {
  pendingContacts.value.splice(index, 1)
}

async function copyContactEmail(c: ProxyBindingContact) {
  try {
    await navigator.clipboard.writeText(c.recipient_email)
  }
  catch {
    return
  }
  copiedContactId.value = c.id
  setTimeout(() => { copiedContactId.value = null }, 1500)
}

async function copyPassword() {
  if (!password.value) return
  try {
    await navigator.clipboard.writeText(password.value)
  }
  catch {
    return
  }
  copiedPassword.value = true
  setTimeout(() => {
    copiedPassword.value = false
  }, 1500)
}

function openWebsite() {
  if (!websiteHref.value) return
  window.open(websiteHref.value, '_blank', 'noopener,noreferrer')
}

async function fetchPasswordManagerData() {
  const bindingId = props.binding?.id
  if (!bindingId || !passwordManagerEnabled.value || passwordDataLoadedFor.value === bindingId) {
    return
  }

  passwordManagerLoading.value = true
  passwordManagerError.value = null
  try {
    const token = localStorage.getItem('api_token') ?? ''
    const [passwordRes, usedOnRes] = await Promise.all([
      apiFetch('/gapi/passwords', { headers: { Token: token } }),
      apiFetch('/gapi/used-on', { headers: { Token: token } }),
    ])

    if (!passwordRes.ok || !usedOnRes.ok) {
      throw new Error(t('form.errorFetchPasswordManager'))
    }

    const passwords: Array<{ related_to_id?: string; password?: string }> = await passwordRes.json()
    const usedOnEntries: Array<{ proxy_binding_id?: string; list?: string[] }> = await usedOnRes.json()

    password.value = passwords.find(entry => entry.related_to_id === bindingId)?.password ?? ''
    websiteUrl.value = usedOnEntries.find(entry => entry.proxy_binding_id === bindingId)?.list?.[0] ?? ''
    passwordDataLoadedFor.value = bindingId
  }
  catch (e) {
    passwordManagerError.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    passwordManagerLoading.value = false
  }
}

async function saveWebsite(bindingId: string, headers: Record<string, string>) {
  const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl.value)
  websiteUrl.value = normalizedWebsiteUrl

  const res = await apiFetch('/gapi/used-on', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      proxy_binding_id: bindingId,
      list: normalizedWebsiteUrl ? [normalizedWebsiteUrl] : [],
    }),
  })
  if (!res.ok) throw new Error(t('form.errorSaveWebsite'))
}

async function savePassword(bindingId: string, headers: Record<string, string>) {
  const pwRes = await apiFetch('/gapi/passwords/proxy-binding', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      proxy_binding_id: bindingId,
      password: password.value,
    }),
  })
  if (!pwRes.ok) throw new Error(t('form.errorSavePassword'))
}

async function fetchContacts() {
  if (!props.binding?.id) return
  contactsLoading.value = true
  contactsError.value = null
  try {
    const res = await apiFetch(`/api/v1/proxy-bindings/${props.binding.id}/contacts`, {
      headers: { Token: localStorage.getItem('api_token') ?? '' },
    })
    if (!res.ok) throw new Error(t('form.errorFetchContacts'))
    const data = await res.json()
    contacts.value = data.data.map((item: {
      id: string
      attributes: { recipient_email: string; reverse_proxy_address: string; description: string; status: number }
    }) => ({
      id: item.id,
      recipient_email: item.attributes.recipient_email,
      reverse_proxy_address: item.attributes.reverse_proxy_address,
      description: item.attributes.description ?? '',
      status: item.attributes.status,
    }))
  }
  catch (e) {
    contactsError.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    contactsLoading.value = false
  }
}


const editAddressCount = computed(() =>
  Object.keys(editRealAddresses.value).length
)

const filteredSuggestions = computed(() => {
  const val = inputValue.value.trim().toLowerCase()
  const inProxy = isEdit ? Object.keys(editRealAddresses.value) : []
  return (props.knownAddresses ?? []).filter(
    a =>
      !selectedAddresses.value.includes(a)
      && !inProxy.includes(a)
      && a.toLowerCase().includes(val),
  )
})

watch(
  () => props.binding,
  b => {
    proxy_address.value = b?.proxy_address ?? ''
    description.value = b?.description ?? ''
    editRealAddresses.value = JSON.parse(
      JSON.stringify(b?.real_addresses ?? {}),
    )
    selectedAddresses.value = []
    inputValue.value = ''
    localPart.value = isEdit ? '' : makeLocalPart()
    domain.value = props.knownDomains?.[0] ?? ''
    contacts.value = []
    newContactEmail.value = ''
    newContactDescription.value = ''
    pendingContacts.value = []
    contactsError.value = null
    password.value = ''
    websiteUrl.value = ''
    showPassword.value = false
    copiedPassword.value = false
    passwordManagerError.value = null
    passwordDataLoadedFor.value = null
    if (b?.id) fetchContacts()
  },
)

watch(
  () => [props.binding?.id, passwordManagerEnabled.value] as const,
  ([bindingId, enabled]) => {
    if (bindingId && enabled) fetchPasswordManagerData()
  },
  { immediate: true },
)

onMounted(() => {
  if (isEdit) fetchContacts()
  if (isEdit && passwordManagerEnabled.value) fetchPasswordManagerData()
})

function selectAddress(addr: string) {
  if (!selectedAddresses.value.includes(addr)) {
    selectedAddresses.value.push(addr)
  }
  inputValue.value = ''
  showDropdown.value = false
  nextTick(() => inputEl.value?.focus())
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    const val = inputValue.value.trim()
    if (val) selectAddress(val)
  }
  else if (
    e.key === 'Backspace' && !inputValue.value && selectedAddresses.value.length
  ) {
    selectedAddresses.value.pop()
  }
  else if (e.key === 'Escape') {
    showDropdown.value = false
  }
}

function removeAddress(addr: string) {
  selectedAddresses.value = selectedAddresses.value.filter(a => a !== addr)
}

function removeEditAddress(addr: string) {
  const copy = { ...editRealAddresses.value }
  delete copy[addr]
  editRealAddresses.value = copy
}

function onBlur() {
  // Delay so click on dropdown option fires first
  setTimeout(() => {
    const val = inputValue.value.trim()
    if (val) selectAddress(val)
    showDropdown.value = false
  }, 150)
}

async function submit() {
  loading.value = true
  error.value = null
  try {
    const token = localStorage.getItem('api_token')
    const headers = {
      'Content-Type': 'application/json',
      Token: token ?? '',
    }

    if (isEdit) {
      const patchedAddresses: Record<string, { is_enabled: boolean }> = Object
        .fromEntries(
          Object.entries(editRealAddresses.value).map(([addr, val]) => [
            addr,
            { is_enabled: val.is_enabled },
          ]),
        )
      for (const addr of selectedAddresses.value) {
        patchedAddresses[addr] = { is_enabled: true }
      }
      const res = await apiFetch(`/api/v1/proxy-bindings/${props.binding!.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          data: {
            id: props.binding!.id,
            type: 'proxy_bindings',
            attributes: {
              description: description.value,
              proxy_address: proxy_address.value,
              real_addresses: patchedAddresses,
            },
          },
        }),
      })
      if (!res.ok) throw new Error(t('form.errorUpdate'))

      if (passwordManagerEnabled.value) {
        await saveWebsite(props.binding!.id, headers)
      }

      if (newContactEmail.value.trim()) {
        const contactRes = await apiFetch('/api/v1/contacts', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            data: {
              type: 'proxy_binding_contacts',
              attributes: {
                recipient_email: newContactEmail.value.trim(),
                description: newContactDescription.value.trim(),
              },
              relationships: {
                proxy_binding: {
                  data: { type: 'proxy_bindings', id: props.binding!.id },
                },
              },
            },
          }),
        })
        if (!contactRes.ok) throw new Error(t('form.errorAddContact'))
      }

      if (passwordManagerEnabled.value) {
        await savePassword(props.binding!.id, headers)
      }
    }
    else {
      const fullAddress = domain.value
        ? `${localPart.value}@${domain.value}`
        : localPart.value
      const res = await apiFetch('/api/v1/proxy-bindings?fast-mode=1', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: {
            type: 'proxy_bindings',
            attributes: {
              proxy_address: fullAddress,
              description: description.value,
              real_addresses: selectedAddresses.value,
            },
          },
        }),
      })
      if (!res.ok) throw new Error(t('form.errorCreate'))

      const created = await res.json() as { data?: { id?: string } }
      const createdId = created.data?.id
      if (createdId && passwordManagerEnabled.value) {
        await saveWebsite(createdId, headers)
        await savePassword(createdId, headers)
      }
    }

    emit('saved', props.binding?.id)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <form
    data-1p-ignore
    data-bwignore
    data-form-type="other"
    @submit.prevent="submit"
  >
    <h2>{{ isEdit ? t('form.editTitle') : t('form.newTitle') }}</h2>

    <div v-if="isEdit" class="field">
      <label for="proxy_address">{{ t('form.proxyAddress') }}</label>
      <input id="proxy_address" v-model="proxy_address" disabled />
    </div>

    <div v-else class="field">
      <label>{{ t('form.proxyAddress') }}</label>
      <div class="proxy-address-split">
        <input
          v-model="localPart"
          class="proxy-local"
          placeholder="local-part"
          required
          autocomplete="off"
          spellcheck="false"
        />
        <button
          type="button"
          class="proxy-refresh"
          :title="t('form.generateNew')"
          @click="localPart = makeLocalPart()"
        >
          &#x21BA;
        </button>
        <span class="proxy-at">@</span>
        <select v-model="domain" class="proxy-domain" required>
          <option v-for="d in knownDomains" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>
    </div>

    <div class="field">
      <label for="description">{{ t('form.description') }}</label>
      <input id="description" v-model="description" />
    </div>

    <div v-if="isEdit" class="field">
      <label>{{ t('form.realAddresses') }}</label>
      <div class="real-address-list">
        <div
          v-for="(addrData, addr) in editRealAddresses"
          :key="addr"
          class="real-address-row"
        >
          <span class="real-address-email">{{ addr }}</span>
          <span v-if="!addrData.is_verified" class="badge-unverified">{{ t('form.unverified') }}</span>
          <button
            type="button"
            class="addr-toggle"
            :class="{ enabled: addrData.is_enabled }"
            :title="addrData.is_enabled ? t('form.disable') : t('form.enable')"
            @click="addrData.is_enabled = !addrData.is_enabled"
          >
            <span class="toggle-track"><span class="toggle-thumb" /></span>
          </button>
          <button
            type="button"
            class="addr-remove"
            :disabled="editAddressCount <= 1"
            :title="t('form.removeAddress')"
            @click="removeEditAddress(String(addr))"
          >
            &#x2715;
          </button>
        </div>
        <div
          v-if="Object.keys(editRealAddresses).length === 0"
          class="no-addresses"
        >
          {{ t('form.noAddresses') }}
        </div>
      </div>
    </div>

    <div class="field">
      <label>{{ isEdit ? t('form.addNewAddress') : t('form.realAddresses') }}</label>
      <div class="combobox" @click="inputEl?.focus()">
        <span v-for="addr in selectedAddresses" :key="addr" class="tag">
          {{ addr }}
          <button
            type="button"
            class="tag-remove"
            @click.stop="removeAddress(addr)"
          >
            &#x2715;
          </button>
        </span>
        <div class="combobox-input-wrap">
          <input
            ref="inputEl"
            v-model="inputValue"
            class="combobox-input"
            :placeholder="t('form.addressPlaceholder')"
            autocomplete="off"
            :required="!isEdit && selectedAddresses.length === 0"
            @focus="showDropdown = true"
            @blur="onBlur"
            @input="showDropdown = true"
            @keydown="onInputKeydown"
          />
        </div>
        <ul v-if="showDropdown && filteredSuggestions.length" class="dropdown">
          <li
            v-for="addr in filteredSuggestions"
            :key="addr"
            @mousedown.prevent="selectAddress(addr)"
          >
            {{ addr }}
          </li>
        </ul>
      </div>
      <small>{{ t('form.addressHint') }}</small>
    </div>

    <div v-if="isEdit" class="field">
      <label>{{ t('form.contacts') }}</label>
      <div class="contacts-list">
        <div v-if="contactsLoading" class="contacts-status">{{ t('form.loadingContacts') }}</div>
        <template v-else>
          <div v-if="contacts.length === 0" class="contacts-status">{{ t('form.noContacts') }}</div>
          <div v-for="c in contacts" :key="c.id" class="contact-row">
            <div class="contact-row-top">
              <div class="contact-main">
                <span class="contact-email">{{ c.recipient_email }}</span>
                <span v-if="c.description" class="contact-desc">{{ c.description }}</span>
              </div>
              <button
                type="button"
                class="contact-copy"
                :class="{ copied: copiedContactId === c.id }"
                :title="copiedContactId === c.id ? t('list.copied') : t('list.copyAddress')"
                @click="copyContactEmail(c)"
              >
                <Copy v-if="copiedContactId !== c.id" :size="14" />
                <Check v-else :size="14" />
              </button>
            </div>
            <span class="contact-reverse" :title="t('form.contactsHint')">{{ c.reverse_proxy_address }}</span>
          </div>
        </template>
      </div>
      <div v-if="pendingContacts.length" class="pending-contacts">
        <div v-for="(p, i) in pendingContacts" :key="i" class="pending-row">
          <div class="pending-main">
            <span class="contact-email">{{ p.email }}</span>
            <span v-if="p.description" class="contact-desc">{{ p.description }}</span>
          </div>
          <span class="pending-badge">{{ t('form.pendingContact') }}</span>
          <button
            type="button"
            class="pending-remove"
            :title="t('form.removeAddress')"
            @click="removePending(i)"
          >&#x2715;</button>
        </div>
      </div>
      <div class="contact-add">
        <input
          v-model="newContactEmail"
          type="email"
          :placeholder="t('form.contactEmailPlaceholder')"
          class="contact-input"
          autocomplete="off"
          @keydown.enter.prevent="addToPending"
        />
        <input
          v-model="newContactDescription"
          :placeholder="t('form.contactDescPlaceholder')"
          class="contact-input"
          autocomplete="off"
        />
        <button
          type="button"
          class="action-icon-btn"
          :disabled="!newContactEmail.trim()"
          :title="t('form.addContact')"
          :aria-label="t('form.addContact')"
          @click="addToPending"
        >
          <Plus :size="16" />
        </button>
      </div>
      <p v-if="contactsError" class="error">{{ contactsError }}</p>
    </div>

    <div v-if="passwordManagerEnabled" class="field">
      <label for="website_url">{{ t('form.websiteUrl') }}</label>
      <div class="pw-row">
        <input
          id="website_url"
          v-model="websiteUrl"
          type="text"
          class="pw-input"
          inputmode="url"
          autocomplete="url"
          :placeholder="t('form.websitePlaceholder')"
        />
        <button
          v-if="websiteHref"
          type="button"
          class="pw-icon-btn"
          :title="t('form.openWebsite')"
          :aria-label="t('form.openWebsite')"
          @click="openWebsite"
        >
          <ExternalLink :size="16" />
        </button>
      </div>
      <p v-if="passwordManagerLoading" class="helper-text">{{ t('form.loadingPasswordManager') }}</p>
      <p v-else-if="passwordManagerError" class="error">{{ passwordManagerError }}</p>
    </div>

    <div v-if="passwordManagerEnabled" class="field">
      <label>{{ t('form.password') }}</label>
      <div class="pw-row">
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          class="pw-input"
          autocomplete="off"
          data-1p-ignore
          data-bwignore
          data-lpignore="true"
          data-form-type="other"
          :placeholder="t('form.passwordPlaceholder')"
        />
        <button
          type="button"
          class="pw-icon-btn"
          :title="showPassword ? t('form.hidePassword') : t('form.showPassword')"
          :aria-label="showPassword ? t('form.hidePassword') : t('form.showPassword')"
          @click="showPassword = !showPassword"
        >
          <EyeOff v-if="showPassword" :size="16" />
          <Eye v-else :size="16" />
        </button>
        <button
          v-if="password"
          type="button"
          class="pw-icon-btn"
          :title="copiedPassword ? t('list.copied') : t('form.copyPassword')"
          :aria-label="copiedPassword ? t('list.copied') : t('form.copyPassword')"
          @click="copyPassword"
        >
          <Check v-if="copiedPassword" :size="16" />
          <Copy v-else :size="16" />
        </button>
      </div>
      <div class="pw-generator">
        <button
          type="button"
          class="pw-generate pw-generate-icon"
          :title="t('form.generatePassword')"
          :aria-label="t('form.generatePassword')"
          @click="generatePassword"
        >
          <RefreshCw :size="16" />
        </button>
        <label class="pw-opt">
          {{ t('form.pwLength') }}
          <input v-model.number="pwLength" type="number" min="8" max="128" class="pw-length" />
        </label>
        <label class="pw-opt"><input v-model="pwLetters" type="checkbox" /> {{ t('form.pwLetters') }}</label>
        <label class="pw-opt"><input v-model="pwNumbers" type="checkbox" /> {{ t('form.pwNumbers') }}</label>
        <label class="pw-opt"><input v-model="pwSymbols" type="checkbox" /> {{ t('form.pwSymbols') }}</label>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="actions">
      <button
        type="submit"
        class="action-icon-btn action-primary"
        :disabled="loading"
        :title="loading ? t('form.saving') : t('form.save')"
        :aria-label="loading ? t('form.saving') : t('form.save')"
      >
        <Save :size="16" />
      </button>
      <button
        type="button"
        class="action-icon-btn"
        :title="t('form.cancel')"
        :aria-label="t('form.cancel')"
        @click="emit('cancel')"
      >
        <X :size="16" />
      </button>
    </div>
  </form>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.proxy-address-split {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  overflow: hidden;
  background: var(--color-background, #fff);
}

.proxy-local {
  flex: 1;
  border: none;
  outline: none;
  padding: 0.45rem 0.6rem;
  font-family: monospace;
  background: transparent;
  min-width: 0;
}

.proxy-at {
  padding: 0 0.25rem;
  font-family: monospace;
  color: var(--color-text, #555);
  user-select: none;
  flex-shrink: 0;
}

.proxy-refresh {
  border: none;
  border-left: 1px solid var(--color-border, #ccc);
  background: var(--color-background-soft, #f8f8f8);
  padding: 0.45rem 0.5rem;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  color: var(--color-text, #555);
  flex-shrink: 0;
  transition: background 0.15s;
}

.proxy-refresh:hover {
  background: var(--color-background-mute, #eee);
}

.proxy-domain {
  border: none;
  border-left: 1px solid var(--color-border, #ccc);
  outline: none;
  padding: 0.45rem 0.5rem;
  background: var(--color-background-soft, #f8f8f8);
  font-family: monospace;
  cursor: pointer;
  flex-shrink: 0;
}

label {
  font-size: 0.875rem;
  font-weight: 500;
}

.real-address-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 4px;
  background: var(--color-background-soft, #f8f8f8);
}

.real-address-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.real-address-email {
  flex: 1;
  font-family: monospace;
  font-size: 0.875rem;
}

.badge-unverified {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: #fef9c3;
  color: #854d0e;
}

@media (prefers-color-scheme: dark) {
  .badge-unverified {
    background: #422006;
    color: #fde68a;
  }
}

.no-addresses {
  font-size: 0.8rem;
  opacity: 0.5;
}

.addr-remove {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.15rem 0.3rem;
  font-size: 0.85rem;
  color: #c00;
  opacity: 0.7;
  flex-shrink: 0;
  border-radius: 3px;
}

.addr-remove:hover:not(:disabled) {
  opacity: 1;
  background: #fee2e2;
}

.addr-remove:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

.addr-toggle {
  display: inline-flex;
  align-items: center;
  background: none;
  border: none;
  padding: 0.2rem;
  cursor: pointer;
  opacity: 0.5;
  flex-shrink: 0;
}

.addr-toggle.enabled {
  opacity: 1;
}

.addr-toggle .toggle-track {
  position: relative;
  display: inline-block;
  width: 2rem;
  height: 1.1rem;
  background: var(--color-border, #ccc);
  border-radius: 999px;
  transition: background 0.2s;
}

.addr-toggle.enabled .toggle-track {
  background: #4f46e5;
}

.addr-toggle .toggle-thumb {
  position: absolute;
  top: 0.15rem;
  left: 0.15rem;
  width: 0.8rem;
  height: 0.8rem;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.addr-toggle.enabled .toggle-thumb {
  transform: translateX(0.9rem);
}

input:not(.combobox-input) {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 4px;
  font-size: 1rem;
}

.combobox {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 4px;
  background: var(--color-background, #fff);
  cursor: text;
  min-height: 2.4rem;
}

.combobox:focus-within {
  outline: 2px solid #4f46e5;
  outline-offset: -1px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  background: #e0e7ff;
  color: #3730a3;
  border-radius: 999px;
  font-size: 0.8rem;
  white-space: nowrap;
}

.helper-text {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.7;
}

@media (prefers-color-scheme: dark) {
  .tag {
    background: #312e81;
    color: #c7d2fe;
  }
}

.tag-remove {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  color: inherit;
  opacity: 0.6;
}

.tag-remove:hover {
  opacity: 1;
}

.combobox-input-wrap {
  flex: 1;
  min-width: 8rem;
}

.combobox-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.9rem;
  padding: 0.1rem 0.2rem;
  color: var(--color-text);
}

.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  margin: 0.2rem 0 0;
  padding: 0.25rem 0;
  list-style: none;
  background: var(--color-background-soft, #fff);
  border: 1px solid var(--color-border, #ddd);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 12rem;
  overflow-y: auto;
}

.dropdown li {
  padding: 0.4rem 0.75rem;
  font-size: 0.9rem;
  cursor: pointer;
}

.dropdown li:hover {
  background: #e0e7ff;
  color: #3730a3;
}

@media (prefers-color-scheme: dark) {
  .dropdown li:hover {
    background: #312e81;
    color: #c7d2fe;
  }
}

small {
  font-size: 0.75rem;
  color: var(--color-text);
  opacity: 0.5;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

button[type="submit"] {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  background: #4f46e5;
  color: #fff;
}

button[type="button"] {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  background: var(--color-border, #ddd);
  color: var(--color-text, #333);
}

.action-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  padding: 0;
}

.action-primary {
  background: #4f46e5;
  color: #fff;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.contacts-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 4px;
  background: var(--color-background-soft, #f8f8f8);
  min-height: 2.5rem;
}

.contacts-status {
  font-size: 0.8rem;
  opacity: 0.5;
}

.contact-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.contact-row-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

@media (min-width: 540px) {
  .contact-row {
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
  }

  .contact-row-top {
    flex: 1;
    min-width: 0;
  }

  .contact-reverse {
    flex: 1;
    min-width: 0;
  }
}

.contact-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.contact-email {
  font-family: monospace;
  font-size: 0.875rem;
}

.contact-desc {
  font-size: 0.75rem;
  opacity: 0.6;
}

.contact-reverse {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--color-text);
  opacity: 0.55;
  word-break: break-all;
  cursor: help;
}

.contact-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  flex-shrink: 0;
  border: none;
  border-radius: 4px;
  background: none;
  cursor: pointer;
  color: var(--color-text);
  opacity: 0.45;
  padding: 0;
  transition: opacity 0.15s, color 0.15s;
}

/* Needs higher specificity than button[type="button"] */
button.contact-copy {
  display: inline-flex;
  background: none;
  padding: 0;
}

.contact-copy:hover {
  opacity: 1;
}

.contact-copy.copied {
  color: #059669;
  opacity: 1;
}

@media (prefers-color-scheme: dark) {
  .contact-copy.copied {
    color: #6ee7b7;
  }
}

.pending-contacts {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.35rem;
}

.pending-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: var(--color-background-soft);
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  font-size: 0.875rem;
}

.pending-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.pending-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  flex-shrink: 0;
}

@media (prefers-color-scheme: dark) {
  .pending-badge {
    background: #451a03;
    color: #fde68a;
  }
}

.pending-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text);
  opacity: 0.5;
  padding: 0.1rem 0.25rem;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.pending-remove:hover {
  opacity: 1;
}

.contact-add {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-top: 0.35rem;
}

.contact-input {
  flex: 1;
  min-width: 10rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 4px;
  font-size: 0.875rem;
  background: var(--color-background, #fff);
  color: var(--color-text);
}

.error {
  color: #dc2626;
  font-size: 0.875rem;
}

.pw-row {
  display: flex;
  gap: 0.4rem;
}

.pw-input {
  flex: 1;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9rem;
  background: var(--color-background, #fff);
  color: var(--color-text);
  min-width: 0;
}

.pw-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  padding: 0;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  background: var(--color-background-soft);
  color: var(--color-text);
  cursor: pointer;
  flex-shrink: 0;
}

.pw-icon-btn:hover {
  background: var(--color-border, #ddd);
}

.pw-generator {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.35rem;
}

.pw-generate {
  padding: 0.35rem 0.75rem;
  border: none;
  border-radius: 4px;
  background: #4f46e5;
  color: #fff;
  font-size: 0.8rem;
  cursor: pointer;
  flex-shrink: 0;
}

.pw-generate:hover {
  background: #4338ca;
}

.pw-generate-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  padding: 0;
}

.pw-opt {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
}

.pw-length {
  width: 3.5rem;
  padding: 0.2rem 0.35rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  font-size: 0.8rem;
  background: var(--color-background, #fff);
  color: var(--color-text);
  text-align: center;
}
</style>
