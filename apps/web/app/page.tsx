'use client'

import { useEffect, useState } from 'react'
import { login, getCurrentUser } from '@/lib/api'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function checkAuth() {
      try {
        const auth = await getCurrentUser()

        if (auth?.user?.role === 'master') {
          router.replace('/master')
        } else {
          router.replace('/dashboard')
        }
      } catch {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      await login(email, password)

      const auth = await getCurrentUser()

      if (auth?.user?.role === 'master') {
        router.replace('/master')
      } else {
        router.replace('/dashboard')
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao logar')
    }
  }

  if (loading) {
    return (
      <main className="flex h-screen items-center justify-center bg-[#0b141a] text-white">
        Carregando...
      </main>
    )
  }

  return (
    <main className="flex h-screen items-center justify-center bg-[#0b141a] text-white">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm space-y-4 rounded-xl bg-[#111b21] p-6 shadow-lg"
      >
        <h1 className="text-xl font-semibold text-center">Login FlyHub</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg bg-[#1f2c33] p-3 outline-none"
          required
        />

        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-[#1f2c33] p-3 outline-none"
          required
        />

        {error && (
          <div className="text-sm text-red-400">{error}</div>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-green-600 p-3 font-medium hover:bg-green-700"
        >
          Entrar
        </button>
      </form>
    </main>
  )
}