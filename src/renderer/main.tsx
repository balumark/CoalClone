import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { APP_NAME } from '@shared/appInfo'
import './styles/index.css'

// Keep the window/tab title in sync with the single app-name constant.
document.title = APP_NAME

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
