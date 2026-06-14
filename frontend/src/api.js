import axios from 'axios'

// In native Capacitor builds, set VITE_API_URL to your Railway URL before running `npm run ios:build`
// e.g. VITE_API_URL=https://your-app.up.railway.app/api
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Opens the print-ready invoice for a deal in a new tab.
// The invoice endpoint is auth-protected, so a plain window.open() to the URL
// would send no token and render blank. We open a blank tab synchronously (to
// stay inside the click gesture and dodge popup blockers), fetch the HTML with
// the auth header attached, then write it into that tab.
export async function openInvoice(dealId) {
  const w = window.open('', '_blank')
  if (w) {
    w.document.write('<p style="font-family:sans-serif;padding:24px;color:#475569">Loading invoice…</p>')
  }
  try {
    const { data } = await api.get(`/invoices/${dealId}`)
    if (w) {
      w.document.open()
      w.document.write(data)
      w.document.close()
    }
  } catch (e) {
    if (w) {
      w.document.body.innerHTML =
        '<p style="font-family:sans-serif;padding:24px;color:#b91c1c">Could not load invoice. Please try again.</p>'
    }
  }
}

export default api
