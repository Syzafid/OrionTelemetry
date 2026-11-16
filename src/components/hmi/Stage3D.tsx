import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Billboard, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import type { VehicleUnit } from "@/data/mockTelemetry";
import { prefersReducedMotion } from "@/lib/motion-tokens";

// Three.js scene palette (WebGL materials need literal colors; mirrors CSS tokens)
const C = {
  crimson: "#E60012",
  emerald: "#10B981",
  amber: "#F59E0B",
  steel: "#64748B",
  line: "#9FB3C8",
  hair: "#1E222B",
  floor: "#0B0D11",
};

type Mode = "WARMUP" | "CRITICAL" | "DEPARTED" | "STANDBY";

const NODES = {
  battery: new THREE.Vector3(1.78, 0.98, 0.45),
  alternator: new THREE.Vector3(1.62, 0.66, -0.25),
  ecu: new THREE.Vector3(0.82, 0.98, -0.5),
  obd: new THREE.Vector3(0.35, 0.72, 0.5),
};

/* ---------------- Procedural SUV geometry ---------------- */

function useSuvGeometry() {
  return useMemo(() => {
    const W = 1.82;
    // Lower body side profile with flared wheel-arch cutouts
    const body = new THREE.Shape();
    body.moveTo(-2.3, 0.42);
    body.lineTo(-1.98, 0.42);
    body.absarc(-1.45, 0.42, 0.53, Math.PI, 0, true);
    body.lineTo(0.92, 0.42);
    body.absarc(1.45, 0.42, 0.53, Math.PI, 0, true);
    body.lineTo(2.28, 0.42);
    body.lineTo(2.42, 0.6); // lower bumper
    body.lineTo(2.44, 0.78);
    body.lineTo(2.36, 0.94); // grille top
    body.lineTo(2.08, 1.04); // hood leading edge
    body.lineTo(1.5, 1.09); // sculpted hood crease
    body.lineTo(0.95, 1.13); // windshield base / cowl
    body.lineTo(-1.2, 1.16); // belt line
    body.lineTo(-2.22, 1.18);
    body.lineTo(-2.4, 1.0); // tailgate
    body.lineTo(-2.42, 0.62);
    body.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(body, {
      depth: W, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 18,
    });
    bodyGeo.translate(0, 0, -W / 2);

    // Greenhouse: raked A pillar, long roof, near-vertical D pillar
    const cabin = new THREE.Shape();
    cabin.moveTo(0.95, 1.13);
    cabin.lineTo(0.12, 1.7); // A pillar
    cabin.lineTo(-0.6, 1.76);
    cabin.lineTo(-1.88, 1.74); // roof
    cabin.lineTo(-2.14, 1.2); // D pillar
    cabin.closePath();
    const CW = 1.52;
    const cabinGeo = new THREE.ExtrudeGeometry(cabin, {
      depth: CW, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2,
    });
    cabinGeo.translate(0, 0, -CW / 2);

    // Pillars B / C + window frame accent lines on both flanks
    const pillarPts: number[] = [];
    const side = (z: number) => {
      const seg = (a: [number, number], b: [number, number]) => pillarPts.push(a[0], a[1], z, b[0], b[1], z);
      seg([-0.5, 1.16], [-0.58, 1.74]); // B
      seg([-1.38, 1.17], [-1.44, 1.74]); // C
      seg([0.85, 1.2], [-2.05, 1.24]); // window sill
      seg([0.85, 0.82], [-2.2, 0.84]); // door crease
      seg([0.4, 0.5], [0.42, 1.12]); // front door shut line
      seg([-1.0, 0.5], [-1.02, 1.14]); // rear door shut line
    };
    side(CW / 2 + 0.09);
    side(-CW / 2 - 0.09);
    const accentGeo = new THREE.BufferGeometry();
    accentGeo.setAttribute("position", new THREE.Float32BufferAttribute(pillarPts, 3));

    const bodyEdges = new THREE.EdgesGeometry(bodyGeo, 18);
    const cabinEdges = new THREE.EdgesGeometry(cabinGeo, 18);
    return { bodyGeo, cabinGeo, bodyEdges, cabinEdges, accentGeo, W, CW };
  }, []);
}

function Wheel({ position, mode, flip }: { position: [number, number, number]; mode: Mode; flip: boolean }) {
  const rim = useRef<THREE.Group>(null);
  const spokes = useMemo(() => Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2), []);
  useFrame((_, d) => {
    if (prefersReducedMotion()) return;
    const dt = Math.min(d, 0.05);
    if (rim.current && mode === "WARMUP") rim.current.rotation.z -= dt * 3.2;
  });
  const lineColor = mode === "CRITICAL" ? C.crimson : C.line;
  return (
    <group position={position} rotation-y={flip ? Math.PI : 0}>
      {/* tire */}
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.42, 0.42, 0.28, 36, 1, true]} />
        <meshStandardMaterial color="#111318" roughness={0.9} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.42, 0.012, 6, 48]} />
        <meshBasicMaterial color={lineColor} transparent opacity={0.6} />
      </mesh>
      {/* multi-spoke rim */}
      <group ref={rim} position-z={0.15}>
        <mesh>
          <torusGeometry args={[0.3, 0.018, 8, 48]} />
          <meshStandardMaterial color="#C9D1DB" metalness={0.9} roughness={0.25} />
        </mesh>
        {spokes.map((a) => (
          <mesh key={a} rotation-z={a} position={[Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0]}>
            <boxGeometry args={[0.28, 0.03, 0.02]} />
            <meshStandardMaterial color="#AEB7C2" metalness={0.85} roughness={0.3} />
          </mesh>
        ))}
        <mesh>
          <cylinderGeometry args={[0.06, 0.06, 0.04, 16]} />
          <meshStandardMaterial color={C.crimson} emissive={C.crimson} emissiveIntensity={0.6} />
        </mesh>
      </group>
    </group>
  );
}

function Suv({ mode }: { mode: Mode }) {
  const g = useSuvGeometry();
  const ghost = mode === "DEPARTED";
  const dashed = useMemo(() => new THREE.LineDashedMaterial({ color: C.steel, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.85 }), []);
  const solid = useMemo(() => new THREE.LineBasicMaterial({ color: C.line, transparent: true, opacity: 0.75 }), []);
  const bodyLines = useRef<THREE.LineSegments>(null);
  const cabinLines = useRef<THREE.LineSegments>(null);
  useMemo(() => {
    // dashed material requires line distances
    const a = new THREE.LineSegments(g.bodyEdges); a.computeLineDistances();
    const b = new THREE.LineSegments(g.cabinEdges); b.computeLineDistances();
  }, [g]);
  useFrame((s) => {
    solid.color.set(mode === "CRITICAL" ? "#C7A3A6" : C.line);
    if (ghost) {
      dashed.opacity = prefersReducedMotion() ? 0.75 : 0.5 + Math.sin(s.clock.elapsedTime * 3) * 0.3;
    }
  });
  const shell = ghost ? 0.03 : 0.09;
  return (
    <group>
      <mesh geometry={g.bodyGeo}>
        <meshPhysicalMaterial color={ghost ? C.steel : "#7C8EA3"} transparent opacity={shell} roughness={0.2} metalness={0.4} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.cabinGeo}>
        <meshPhysicalMaterial color={ghost ? C.steel : "#5E7186"} transparent opacity={shell * 0.8} roughness={0.1} metalness={0.5} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments ref={bodyLines} geometry={g.bodyEdges} material={ghost ? dashed : solid} />
      <lineSegments ref={cabinLines} geometry={g.cabinEdges} material={ghost ? dashed : solid} />
      <lineSegments geometry={g.accentGeo}>
        <lineBasicMaterial color={ghost ? C.steel : C.line} transparent opacity={0.35} />
      </lineSegments>
      {/* roof rails */}
      {[-1, 1].map((s) => (
        <group key={s} position={[-0.85, 1.86, s * 0.62]}>
          <mesh>
            <boxGeometry args={[2.0, 0.035, 0.05]} />
            <meshStandardMaterial color="#AEB7C2" metalness={0.9} roughness={0.3} transparent opacity={ghost ? 0.3 : 1} />
          </mesh>
          {[-0.9, 0.9].map((x) => (
            <mesh key={x} position={[x, -0.05, 0]}>
              <boxGeometry args={[0.08, 0.08, 0.05]} />
              <meshStandardMaterial color="#7C8794" metalness={0.8} roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
      {/* headlamps / tail lamps */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[2.42, 0.9, s * 0.68]}>
            <boxGeometry args={[0.04, 0.05, 0.36]} />
            <meshBasicMaterial color={ghost ? C.steel : "#E8F4FF"} />
          </mesh>
          <mesh position={[-2.44, 0.98, s * 0.72]}>
            <boxGeometry args={[0.04, 0.16, 0.22]} />
            <meshBasicMaterial color={C.crimson} />
          </mesh>
        </group>
      ))}
      {/* front dynamic shield chrome */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[2.44, 0.72, s * 0.5]} rotation-x={s * 0.5}>
          <boxGeometry args={[0.03, 0.42, 0.04]} />
          <meshStandardMaterial color="#DDE3EA" metalness={1} roughness={0.15} />
        </mesh>
      ))}
      {[[1.45, 0.42, 0.92], [1.45, 0.42, -0.92], [-1.45, 0.42, 0.92], [-1.45, 0.42, -0.92]].map((p, i) => (
        <Wheel key={i} position={p as [number, number, number]} mode={mode} flip={(p[2] ?? 0) < 0} />
      ))}
    </group>
  );
}

/* ---------------- Internal harness ---------------- */

function NodeBox({ pos, color, pulse = false, size = 0.13 }: { pos: THREE.Vector3; color: string; pulse?: boolean; size?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    if (pulse && !prefersReducedMotion()) {
      const k = 1 + Math.sin(s.clock.elapsedTime * 6) * 0.15;
      ref.current.scale.setScalar(k);
    } else {
      ref.current.scale.setScalar(1);
    }
  });
  return (
    <group position={pos}>
      <mesh ref={ref}>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
      </mesh>
      <mesh>
        <boxGeometry args={[size * 1.7, size * 1.7, size * 1.7]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function FlowPath({ from, to, lift, color, speed, count = 6 }: {
  from: THREE.Vector3; to: THREE.Vector3; lift: number; color: string; speed: number; count?: number;
}) {
  const curve = useMemo(() => {
    const mid = from.clone().lerp(to, 0.5);
    mid.y += lift;
    return new THREE.CatmullRomCurve3([from, mid, to]);
  }, [from, to, lift]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 40, 0.008, 6, false), [curve]);
  const dots = useRef<(THREE.Mesh | null)[]>([]);
  const off = useRef(0);
  useFrame((_, d) => {
    if (!prefersReducedMotion()) {
      off.current = (off.current + Math.min(d, 0.05) * speed) % 1;
    }
    dots.current.forEach((m, i) => {
      if (!m) return;
      const t = (off.current + i / count) % 1;
      m.position.copy(curve.getPoint(t));
    });
  });
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial color={color} transparent opacity={0.45} />
      </mesh>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} ref={(el) => { dots.current[i] = el; }}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Ripples({ pos }: { pos: THREE.Vector3 }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((s) => {
    const reduced = prefersReducedMotion();
    rings.current.forEach((m, i) => {
      if (!m) return;
      if (reduced) {
        m.scale.setScalar(0.5 + i * 0.35);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.65 - i * 0.15;
        return;
      }
      const t = (s.clock.elapsedTime * 0.7 + i / 3) % 1;
      m.scale.setScalar(0.2 + t * 1.6);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9;
    });
  });
  return (
    <Billboard position={pos}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => { rings.current[i] = el; }}>
          <ringGeometry args={[0.36, 0.4, 48]} />
          <meshBasicMaterial color={C.crimson} transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </Billboard>
  );
}

function ThermalAura({ pos }: { pos: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    if (prefersReducedMotion()) {
      ref.current.scale.setScalar(0.5);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.2;
      return;
    }
    const k = 0.5 + Math.sin(s.clock.elapsedTime * 2.4) * 0.08;
    ref.current.scale.setScalar(k);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(s.clock.elapsedTime * 2.4) * 0.07;
  });
  return (
    <mesh ref={ref} position={pos}>
      <sphereGeometry args={[1, 24, 24]} />
      <meshBasicMaterial color={C.amber} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

function Beacon() {
  const arcs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((s) => {
    const reduced = prefersReducedMotion();
    arcs.current.forEach((m, i) => {
      if (!m) return;
      if (reduced) {
        m.scale.setScalar(0.6 + i * 0.3);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.8 - i * 0.2;
        return;
      }
      const t = (s.clock.elapsedTime * 0.8 + i / 3) % 1;
      m.scale.setScalar(0.4 + t * 1.2);
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    });
  });
  return (
    <Billboard position={[-0.8, 2.2, 0]}>
      <mesh>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color={C.amber} toneMapped={false} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => { arcs.current[i] = el; }} rotation-z={Math.PI / 4}>
          <ringGeometry args={[0.28, 0.31, 32, 1, 0, Math.PI / 2]} />
          <meshBasicMaterial color={C.amber} transparent toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </Billboard>
  );
}

function Harness({ mode }: { mode: Mode }) {
  const warm = mode === "WARMUP";
  const crit = mode === "CRITICAL";
  const flow = warm ? C.emerald : crit ? C.crimson : C.line;
  const speed = warm ? 1.1 : crit ? 0.12 : 0.2;
  return (
    <group>
      <NodeBox pos={NODES.battery} color={crit ? C.crimson : C.emerald} pulse={crit} />
      <NodeBox pos={NODES.alternator} color={warm ? C.amber : "#6B7684"} pulse={warm} size={0.17} />
      <NodeBox pos={NODES.ecu} color={warm ? C.emerald : "#6B7684"} size={0.11} />
      <NodeBox pos={NODES.obd} color={C.crimson} size={0.1} />
      <FlowPath
        from={NODES.battery}
        to={NODES.obd}
        lift={0.15}
        color={crit ? C.crimson : C.emerald}
        speed={speed}
        count={warm ? 6 : 3}
      />
      {warm && (
        <>
          <FlowPath from={NODES.alternator} to={NODES.battery} lift={0.2} color={flow} speed={speed * 1.4} count={9} />
          <FlowPath from={NODES.ecu} to={NODES.obd} lift={-0.05} color={C.line} speed={0.6} count={4} />
          <FlowPath from={NODES.alternator} to={NODES.ecu} lift={0.25} color={C.emerald} speed={0.4} count={4} />
          <ThermalAura pos={NODES.alternator} />
        </>
      )}
      {crit && <Ripples pos={NODES.battery} />}
    </group>
  );
}

/* ---------------- Stage furniture ---------------- */

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    if (prefersReducedMotion()) return;
    if (ref.current) ref.current.rotation.y += Math.min(d, 0.05) * 0.18;
  });
  return (
    <group ref={ref}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
        <circleGeometry args={[4.2, 96]} />
        <meshStandardMaterial color={C.floor} metalness={0.6} roughness={0.35} />
      </mesh>
      <primitive object={new THREE.PolarGridHelper(4.2, 24, 8, 96, C.hair, "#2A303B")} position-y={0.004} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.006}>
        <ringGeometry args={[4.15, 4.2, 128]} />
        <meshBasicMaterial color={C.crimson} toneMapped={false} />
      </mesh>
      {children}
    </group>
  );
}

export default function Stage3D({ unit, active }: { unit: VehicleUnit; active: boolean }) {
  const mode = unit.state as Mode;
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [5.6, 3.1, 5.6], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
    >
      <fog attach="fog" args={["#07080A", 9, 20]} />
      <ambientLight intensity={0.4} />
      <spotLight position={[0, 8, 0]} angle={0.6} penumbra={0.8} intensity={60} color="#ffffff" />
      <directionalLight position={[-4, 3, -3]} intensity={0.6} color="#E2E8F0" />
      <Environment resolution={64}>
        <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1} color="#CBD5E1" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer intensity={0.8} color="#E60012" position={[5, 1, 1]} rotation-y={-Math.PI / 2} scale={[20, 0.5, 1]} />
      </Environment>

      <Turntable>
        <group>
          <Suv mode={mode} />
          {mode !== "DEPARTED" && <Harness mode={mode} />}
          {mode === "DEPARTED" && <Beacon />}
        </group>
      </Turntable>

      <OrbitControls
        enablePan={false}
        autoRotate={false}
        minPolarAngle={Math.PI * 0.22}
        maxPolarAngle={Math.PI * 0.47}
        minDistance={4.5}
        maxDistance={11}
        target={[0, 0.78, 0]}
      />
    </Canvas>
  );
}
