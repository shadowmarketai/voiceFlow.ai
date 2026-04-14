/**
 * ThreeScene — Light theme 3D background for the Login page.
 *
 * Soft pastel floating mesh with gentle rotation.
 * Performance: frameloop="demand", simple geometry, DPR capped at 1.5.
 * Returns null if WebGL is not supported.
 */

import { Suspense, useRef, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial, Sphere } from '@react-three/drei'

// ── Check WebGL support ─────────────────────────────────────────

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

// ── Main floating blob ──────────────────────────────────────────

function PastelBlob() {
  const meshRef = useRef()
  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()
    meshRef.current.rotation.x = Math.sin(t * 0.15) * 0.2
    meshRef.current.rotation.y = t * 0.1
  })

  return (
    <Float speed={0.8} rotationIntensity={0.3} floatIntensity={1.2}>
      <Sphere ref={meshRef} args={[1.8, 48, 48]} position={[0, 0, 0]}>
        <MeshDistortMaterial
          color="#c7d2fe"
          attach="material"
          distort={0.35}
          speed={1.2}
          roughness={0.6}
          metalness={0.1}
          emissive="#a78bfa"
          emissiveIntensity={0.08}
          envMapIntensity={0.4}
        />
      </Sphere>
    </Float>
  )
}

// ── Small accent orb ────────────────────────────────────────────

function AccentOrb({ position, color, size = 0.2, speed = 1 }) {
  return (
    <Float speed={speed} rotationIntensity={0.6} floatIntensity={2}>
      <mesh position={position}>
        <sphereGeometry args={[size, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.15}
          roughness={0.5}
          metalness={0.15}
          transparent
          opacity={0.7}
        />
      </mesh>
    </Float>
  )
}

// ── Camera drift ────────────────────────────────────────────────

function CameraRig() {
  useFrame(({ camera, mouse }) => {
    camera.position.x += (mouse.x * 0.4 - camera.position.x) * 0.03
    camera.position.y += (-mouse.y * 0.3 - camera.position.y) * 0.03
    camera.lookAt(0, 0, 0)
  })
  return null
}

// ── Public component ────────────────────────────────────────────

export default function ThreeScene() {
  const [webgl, setWebgl] = useState(true)

  useEffect(() => {
    if (!supportsWebGL()) setWebgl(false)
  }, [])

  if (!webgl) return null

  return (
    <Canvas
      camera={{ position: [0, 0, 5.5], fov: 45 }}
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        {/* Lighting only — no external HDRI download needed */}
        <ambientLight intensity={1.0} color="#f8fafc" />
        <directionalLight position={[5, 5, 5]} intensity={0.6} color="#e0e7ff" />
        <directionalLight position={[-3, 3, -3]} intensity={0.3} color="#c4b5fd" />
        <pointLight position={[-5, 3, 2]} intensity={0.5} color="#c4b5fd" />
        <pointLight position={[3, -3, -2]} intensity={0.4} color="#fbcfe8" />

        {/* Main pastel blob */}
        <PastelBlob />

        {/* Accent orbs */}
        <AccentOrb position={[-2.5, 1.5, -1]} color="#c7d2fe" size={0.15} speed={1.1} />
        <AccentOrb position={[2.5, -1, -1.5]} color="#f0abfc" size={0.18} speed={0.9} />
        <AccentOrb position={[-1.8, -1.8, 0.5]} color="#a5b4fc" size={0.12} speed={1.3} />
        <AccentOrb position={[2, 2, -0.5]} color="#ddd6fe" size={0.14} speed={1.0} />

        <CameraRig />
      </Suspense>
    </Canvas>
  )
}
