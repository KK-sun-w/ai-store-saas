import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    loading: false,
    loadingCount: 0,
  }),
  actions: {
    startLoading() {
      this.loadingCount++
      this.loading = true
    },
    stopLoading() {
      this.loadingCount = Math.max(0, this.loadingCount - 1)
      if (this.loadingCount === 0) this.loading = false
    },
    resetLoading() {
      this.loadingCount = 0
      this.loading = false
    }
  }
})
