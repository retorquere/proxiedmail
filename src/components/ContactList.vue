<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watch } from 'vue'
import type { ProxyBinding, ProxyBindingContact } from '../types/proxy-binding'
import { apiFetch } from '../utils/api'

const props = defineProps<{
  proxyBindings: ProxyBinding[]
}>()

const emit = defineEmits<{
  (e: 'openProxy', binding: ProxyBinding): void
}>()

const { t } = useI18n()

interface ContactWithProxy extends ProxyBindingContact {
  proxyBinding: ProxyBinding
}

const contacts = ref<ContactWithProxy[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')

const filteredContacts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return contacts.value
  return contacts.value.filter(
    c =>
      c.recipient_email.toLowerCase().includes(q)
      || c.description.toLowerCase().includes(q)
      || c.proxyBinding.proxy_address.toLowerCase().includes(q)
      || (c.proxyBinding.description ?? '').toLowerCase().includes(q),
  )
})

async function fetchAllContacts(bindings: ProxyBinding[]) {
  if (!bindings.length) return
  loading.value = true
  error.value = null
  contacts.value = []
  try {
    const results = await Promise.all(
      bindings.map(async (binding) => {
        const res = await apiFetch(`/api/v1/proxy-bindings/${binding.id}/contacts`, {
          headers: { Token: localStorage.getItem('api_token') ?? '' },
        })
        if (!res.ok) return []
        const data = await res.json()
        return data.data.map((item: {
          id: string
          attributes: { recipient_email: string; reverse_proxy_address: string; description: string; status: number }
        }) => ({
          id: item.id,
          recipient_email: item.attributes.recipient_email,
          reverse_proxy_address: item.attributes.reverse_proxy_address,
          description: item.attributes.description ?? '',
          status: item.attributes.status,
          proxyBinding: binding,
        }))
      }),
    )
    contacts.value = results.flat()
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    loading.value = false
  }
}

// Fetch as soon as we have bindings (covers both: bindings already loaded when
// tab first opens, and the rare case they finish loading afterwards).
watch(
  () => props.proxyBindings,
  (bindings) => { fetchAllContacts(bindings) },
  { immediate: true },
)
</script>

<template>
  <section>
    <div class="search-bar">
      <input
        v-model="searchQuery"
        type="search"
        :placeholder="t('contacts.filterPlaceholder')"
        class="search-input"
      />
    </div>
    <div v-if="loading" class="status">{{ t('contacts.loading') }}</div>
    <div v-else-if="error" class="status error">{{ error }}</div>
    <div v-else-if="filteredContacts.length === 0 && searchQuery.trim()" class="status">{{ t('contacts.noResults', { query: searchQuery.trim() }) }}</div>
    <div v-else-if="contacts.length === 0" class="status">{{ t('contacts.empty') }}</div>
    <ul v-else class="list">
      <li
        v-for="contact in filteredContacts"
        :key="contact.id"
        class="item"
        role="button"
        tabindex="0"
        @click="emit('openProxy', contact.proxyBinding)"
        @keydown.enter="emit('openProxy', contact.proxyBinding)"
      >
        <div class="item-main">
          <span class="contact-email">{{ contact.recipient_email }}</span>
          <span v-if="contact.description" class="description">{{ contact.description }}</span>
        </div>
        <div class="item-proxy">
          <span class="proxy-via">{{ t('contacts.via') }}</span>
          <span class="proxy-address">{{ contact.proxyBinding.proxy_address }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.search-bar {
  margin-bottom: 0.75rem;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  box-sizing: border-box;
  outline: none;
}

.search-input:focus {
  border-color: #4f46e5;
}

.status {
  padding: 2rem;
  text-align: center;
  color: var(--color-text);
  opacity: 0.6;
}

.status.error {
  color: #dc2626;
  opacity: 1;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1rem;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.item:hover {
  border-color: #4f46e5;
}

.item:focus {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}

.item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.contact-email {
  font-family: monospace;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-heading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.description {
  font-size: 0.8rem;
  color: var(--color-text);
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-proxy {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  max-width: 50%;
}

.proxy-via {
  font-size: 0.75rem;
  color: var(--color-text);
  opacity: 0.5;
  flex-shrink: 0;
}

.proxy-address {
  font-family: monospace;
  font-size: 0.8rem;
  color: #4f46e5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (prefers-color-scheme: dark) {
  .proxy-address {
    color: #a5b4fc;
  }
}
</style>
