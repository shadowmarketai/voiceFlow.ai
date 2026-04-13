/**
 * Dashboard3DOrb — Lazy-loaded 3D floating orb for the hero section
 * Uses @react-three/fiber + drei with demand-based rendering
 */

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Float, Environment } from '@react-three/drei';
import * as THREE from 'three';

function FloatingOrb() {
  const meshRef = useRef();

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.15;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
    }
  });

  const gradientMap = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(0.5, '#8b5cf6');
    gradient.addColorStop(1, '#ec4899');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 1);
    return new THREE.CanvasTexture(canvas);
  }, []);

  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
      <mesh ref={meshRef} scale={1.8}>
        <icosahedronGeometry args={[1, 4]} />
        <MeshDistortMaterial
          color="#7c3aed"
          envMapIntensity={0.6}
          clearcoat={0.8}
          clearcoatRoughness={0.2}
          metalness={0.1}
          roughness={0.3}
          distort={0.25}
          speed={1.5}
          transparent
          opacity={0.7}
        />
      </mesh>
    </Float>
  );
}

function SecondaryOrb() {
  const meshRef = useRef();

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = -state.clock.elapsedTime * 0.2;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.3}>
      <mesh ref={meshRef} position={[2.5, 0.5, -1]} scale={0.6}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#6366f1"
          transparent
          opacity={0.3}
          wireframe
        />
      </mesh>
    </Float>
  );
}

export default function Dashboard3DOrb() {
  return (
    <div className="w-full h-[200px] rounded-2xl overflow-hidden relative"
      style={{
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 40%, #ec4899 100%)',
      }}
    >
      <Canvas
        frameloop="always"
        camera={{ position: [0, 0, 5], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <pointLight position={[-3, -3, 2]} intensity={0.4} color="#ec4899" />
        <FloatingOrb />
        <SecondaryOrb />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
