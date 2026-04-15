/**
 * ThreeScene — Custom Voice AI 3D scene for the Login page.
 *
 * Elements (all procedural, no external assets):
 *   1. VoiceOrb    — Custom GLSL shader sphere with voice-like vertex displacement
 *   2. SoundRings  — Orbital torus rings pulsing like audio waves
 *   3. Particles   — InstancedMesh field (single draw call, 80 instances)
 *   4. CameraRig   — Subtle mouse-following camera for parallax depth
 *
 * Performance:
 *   - DPR capped at 1.5
 *   - InstancedMesh for particles (1 draw call instead of 80)
 *   - Simple geometry (low vertex counts)
 *   - All animation in shaders / useFrame (no re-renders)
 *   - Lazy loaded via React.lazy in Login.jsx
 *   - WebGL check — returns null on unsupported devices
 */

import { useRef, useMemo, useState, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import * as THREE from 'three'

// ── WebGL support check ─────────────────────────────────────────

function supportsWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

// ── Custom GLSL Voice Orb ───────────────────────────────────────

const voiceOrbVertex = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vDisplacement;

  void main() {
    vNormal = normalize(normalMatrix * normal);

    // Multi-frequency voice-like displacement
    float d = 0.0;
    d += sin(position.x * 3.0 + uTime * 1.5) * 0.15;
    d += sin(position.y * 4.0 + uTime * 1.2) * 0.12;
    d += sin(position.z * 2.5 + uTime * 1.8) * 0.10;
    d += sin(position.x * 5.0 + position.y * 3.0 + uTime * 2.0) * 0.08;
    d += cos(position.z * 6.0 + position.x * 2.0 + uTime * 1.0) * 0.06;
    d *= uIntensity;
    vDisplacement = d;

    vec3 newPos = position + normal * d;
    vec4 worldPos = modelMatrix * vec4(newPos, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const voiceOrbFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vDisplacement;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.8);

    // Blend core colors based on displacement
    vec3 color = mix(uColorA, uColorB, vDisplacement * 2.0 + 0.5);

    // Add edge glow with accent color
    color = mix(color, uColorC, fresnel * 0.55);

    // Pulsing rim light
    color += uColorC * fresnel * 0.25 * (0.5 + 0.5 * sin(uTime * 0.8));

    // Subtle inner glow
    float innerGlow = smoothstep(0.0, 0.3, vDisplacement + 0.15);
    color += uColorB * innerGlow * 0.1;

    float alpha = 0.92 + fresnel * 0.08;
    gl_FragColor = vec4(color, alpha);
  }
`

function VoiceOrb() {
  const meshRef = useRef()

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uColorA: { value: new THREE.Color('#4f46e5') }, // indigo-600
      uColorB: { value: new THREE.Color('#7c3aed') }, // violet-600
      uColorC: { value: new THREE.Color('#06b6d4') }, // cyan-500
    }),
    [],
  )

  useFrame(({ clock }) => {
    if (!uniforms.uTime) return
    uniforms.uTime.value = clock.getElapsedTime()
  })

  return (
    <Float speed={0.6} rotationIntensity={0.15} floatIntensity={0.8}>
      <mesh ref={meshRef} scale={1.6}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          vertexShader={voiceOrbVertex}
          fragmentShader={voiceOrbFragment}
          uniforms={uniforms}
          transparent
          side={THREE.FrontSide}
        />
      </mesh>
    </Float>
  )
}

// ── Sound Wave Rings ────────────────────────────────────────────

function SoundRing({ radius, tubeRadius, color, speed, axis }) {
  const ref = useRef()

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    if (axis === 'x') {
      ref.current.rotation.x = t * speed
      ref.current.rotation.z = Math.sin(t * 0.3) * 0.2
    } else if (axis === 'y') {
      ref.current.rotation.y = t * speed
      ref.current.rotation.x = Math.cos(t * 0.4) * 0.15
    } else {
      ref.current.rotation.z = t * speed
      ref.current.rotation.y = Math.sin(t * 0.25) * 0.25
    }
    // Subtle scale pulse
    const pulse = 1.0 + Math.sin(t * 1.5 + radius) * 0.03
    ref.current.scale.setScalar(pulse)
  })

  return (
    <mesh ref={ref}>
      <torusGeometry args={[radius, tubeRadius, 16, 80]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.4}
        roughness={0.3}
        metalness={0.6}
        transparent
        opacity={0.35}
      />
    </mesh>
  )
}

function SoundRings() {
  return (
    <group>
      <SoundRing radius={2.4} tubeRadius={0.008} color="#818cf8" speed={0.3} axis="x" />
      <SoundRing radius={2.7} tubeRadius={0.006} color="#a78bfa" speed={-0.2} axis="y" />
      <SoundRing radius={3.0} tubeRadius={0.005} color="#06b6d4" speed={0.15} axis="z" />
    </group>
  )
}

// ── Instanced Particle Field ────────────────────────────────────

const PARTICLE_COUNT = 80

function ParticleField() {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])

  // Pre-compute random positions + speeds
  const particles = useMemo(() => {
    const arr = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr.push({
        x: (Math.random() - 0.5) * 10,
        y: (Math.random() - 0.5) * 8,
        z: (Math.random() - 0.5) * 6 - 2,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        phase: Math.random() * Math.PI * 2,
        scale: 0.02 + Math.random() * 0.04,
      })
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]
      dummy.position.set(
        p.x + Math.sin(t * p.speedX + p.phase) * 0.8,
        p.y + Math.cos(t * p.speedY + p.phase) * 0.6,
        p.z + Math.sin(t * 0.2 + p.phase) * 0.4,
      )
      dummy.scale.setScalar(p.scale)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, PARTICLE_COUNT]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial
        color="#c4b5fd"
        emissive="#818cf8"
        emissiveIntensity={0.5}
        transparent
        opacity={0.6}
        roughness={0.5}
      />
    </instancedMesh>
  )
}

// ── Floating Energy Dots (accent) ───────────────────────────────

function EnergyDot({ position, color, size, speed }) {
  const ref = useRef()

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    ref.current.position.y = position[1] + Math.sin(t * speed) * 0.5
    ref.current.position.x = position[0] + Math.cos(t * speed * 0.7) * 0.3
    const pulse = size * (1 + Math.sin(t * 2 + position[0]) * 0.3)
    ref.current.scale.setScalar(pulse)
  })

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.8}
        transparent
        opacity={0.7}
      />
    </mesh>
  )
}

// ── Camera rig — mouse parallax ─────────────────────────────────

function CameraRig() {
  useFrame(({ camera, pointer }) => {
    camera.position.x += (pointer.x * 0.5 - camera.position.x) * 0.02
    camera.position.y += (-pointer.y * 0.4 - camera.position.y) * 0.02
    camera.lookAt(0, 0, 0)
  })
  return null
}

// ── Scene composition ───────────────────────────────────────────

function Scene() {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} color="#e0e7ff" />
      <directionalLight position={[5, 5, 5]} intensity={0.5} color="#c7d2fe" />
      <directionalLight position={[-4, 3, -3]} intensity={0.3} color="#7c3aed" />
      <pointLight position={[-3, 2, 3]} intensity={0.6} color="#818cf8" distance={12} />
      <pointLight position={[3, -2, 2]} intensity={0.4} color="#06b6d4" distance={10} />
      <pointLight position={[0, 3, -2]} intensity={0.3} color="#a78bfa" distance={10} />

      {/* Core elements */}
      <VoiceOrb />
      <SoundRings />
      <ParticleField />

      {/* Accent energy dots */}
      <EnergyDot position={[-3.5, 1.5, -1]} color="#818cf8" size={0.08} speed={1.2} />
      <EnergyDot position={[3.2, -1.2, -1.5]} color="#06b6d4" size={0.06} speed={0.9} />
      <EnergyDot position={[-2, -2, 0.5]} color="#a78bfa" size={0.07} speed={1.4} />
      <EnergyDot position={[2.8, 2.2, -0.8]} color="#c084fc" size={0.05} speed={1.1} />
      <EnergyDot position={[-1.5, 2.5, -2]} color="#67e8f9" size={0.06} speed={0.8} />

      <CameraRig />
    </>
  )
}

// ── Public export ───────────────────────────────────────────────

export default function ThreeScene() {
  const [webgl, setWebgl] = useState(true)

  useEffect(() => {
    if (!supportsWebGL()) setWebgl(false)
  }, [])

  if (!webgl) return null

  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  )
}
