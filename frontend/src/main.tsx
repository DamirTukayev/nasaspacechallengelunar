import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import Page from './Page'
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
        <Suspense
          fallback={
            <p role="status" className="page-loading">
              Loading Noctis Horizon…
            </p>
          }
        >
          <Page />
        </Suspense>
      </MissionProvider>
    </QueryClientProvider>
  </StrictMode>,
)
