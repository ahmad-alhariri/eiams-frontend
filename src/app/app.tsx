import { AppRouter } from '@/app/app-router'
import { useSessionHydration } from '@/modules/auth/hooks/use-session-hydration'

function App() {
  useSessionHydration()

  return <AppRouter />
}

export default App
