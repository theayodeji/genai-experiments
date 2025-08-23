import { useState } from 'react'
import './App.css'
import RestaurantOrderingApp from './RestaurantOrderingApp'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <RestaurantOrderingApp />
    </>
  )
}

export default App
