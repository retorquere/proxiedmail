<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const address = computed(() => {
  const value = route.query.address
  return typeof value === 'string' ? value : ''
})

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }

  router.push({ name: 'home' })
}
</script>

<template>
  <main class="proxy-address-screen">
    <button class="back-button" type="button" @click="goBack">
      Back
    </button>
    <div class="address-card">
      <h1 class="address-value">{{ address }}</h1>
    </div>
  </main>
</template>

<style scoped>
.proxy-address-screen {
  min-height: 100vh;
  display: grid;
  align-content: start;
  gap: 1.5rem;
  padding: 1rem;
}

.back-button {
  width: fit-content;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-background-soft);
  color: var(--color-text);
  padding: 0.65rem 1rem;
  font: inherit;
}

.address-card {
  min-height: calc(100vh - 6rem);
  display: grid;
  align-content: center;
  justify-items: center;
  padding: 2rem 1rem;
  border-radius: 24px;
  background: linear-gradient(160deg, var(--color-background-soft), var(--color-background));
  text-align: center;
}

.address-value {
  margin: 0;
  font-size: clamp(2rem, 7vw, 4rem);
  line-height: 1.1;
  overflow-wrap: anywhere;
}

@media (orientation: landscape) and (max-height: 600px) {
  .address-value {
    font-size: clamp(1.5rem, 4.2vw, 2.5rem);
  }
}
</style>
