import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { MissionProvider } from './features/mission/MissionContext'
import './index.css'
import './styles/typography.css'
import './styles/controls.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MissionProvider>
        <App />
      </MissionProvider>
    </QueryClientProvider>
  </StrictMode>,
)
