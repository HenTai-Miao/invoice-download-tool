import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/invoice-upload'
    },
    {
      path: '/invoice-upload',
      name: 'invoice-upload',
      component: () => import('../views/InvoiceDownloadView.vue'),
    },
  ],
})

export default router