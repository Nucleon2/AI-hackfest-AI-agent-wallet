"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

const PARTICLE_COUNT = 1500;
const PARTICLE_RADIUS_MIN = 2.4;
const PARTICLE_RADIUS_MAX = 3.2;

function generateSphereParticles(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r =
      PARTICLE_RADIUS_MIN +
      Math.random() * (PARTICLE_RADIUS_MAX - PARTICLE_RADIUS_MIN);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

export function WalletOrb() {
  const orbRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);

  const particlePositions = useMemo(
    () => generateSphereParticles(PARTICLE_COUNT),
    []
  );

  useFrame((_, delta) => {
    if (orbRef.current) {
      orbRef.current.rotation.y += delta * 0.15;
      orbRef.current.rotation.x += delta * 0.05;
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y -= delta * 0.04;
      particlesRef.current.rotation.x += delta * 0.02;
    }
  });

  return (
    <group>
      <mesh ref={orbRef}>
        <icosahedronGeometry args={[1.4, 16]} />
        <MeshDistortMaterial
          color="#6366f1"
          distort={0.35}
          speed={1.5}
          roughness={0.2}
          metalness={0.4}
        />
      </mesh>

      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particlePositions, 3]}
            count={PARTICLE_COUNT}
            array={particlePositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.02}
          color="#a5b4fc"
          transparent
          opacity={0.8}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
