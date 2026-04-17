"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { WalletOrb } from "./WalletOrb";

export function Scene() {
  return (
    <div
      aria-hidden
      style={{ position: "fixed", inset: 0, zIndex: 0 }}
      className="pointer-events-none"
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={1.2} />
        <pointLight position={[-5, -3, -2]} intensity={0.5} color="#818cf8" />
        <Suspense fallback={null}>
          <WalletOrb />
        </Suspense>
      </Canvas>
    </div>
  );
}
