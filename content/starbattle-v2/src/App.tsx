import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div id = "app">
      <section id="header">Header</section>
      <section id="content">
        <div id="content-board">Board goes here</div>
        <div id="content-workspace">Workspace</div>
        <div id="content-blockstore">This is where the blocks go</div>
      </section>
      <section id="footer">Footer</section>
    </div>
  )
}

export default App
