import React, { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Sky, Stars, Environment, Box, Sphere, Plane, Text } from '@react-three/drei';
import * as THREE from 'three';
import { GoogleGenAI } from "@google/genai";
import { MapPin, MessageSquare, Users, Send, Navigation2, Settings, X, Trash2, User, Sparkles, Zap, Dices, Shield, Sword, Brain, Heart, Star as StarIcon } from 'lucide-react';

interface Player {
  id: string;
  lat: number;
  lng: number;
  name: string;
  color: string;
  icon?: string;
  stats?: CharacterStats;
}

interface CharacterStats {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  level: number;
  xp: number;
}

interface GameNPC {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'civilian' | 'cop' | 'alien';
  health: number;
  thought?: string;
}

type WeatherType = 'clear' | 'rain' | 'sandstorm' | 'glitch';

interface ChatMessage {
  id: string;
  name: string;
  message: string;
  color: string;
  timestamp: string;
}

const VEGAS_CENTER = { lat: 36.1126, lng: -115.1767 }; // Bellagio Fountains
const AREA_51 = { lat: 37.2350, lng: -115.8111 }; // Area 51

const TUNNEL_ENTRANCES = [
  { name: "Flamingo Wash (Behind Caesars)", lat: 36.1178, lng: -115.1710 },
  { name: "Tropicana Wash (Near MGM)", lat: 36.1015, lng: -115.1675 },
  { name: "Koval Lane Access", lat: 36.1141, lng: -115.1625 },
  { name: "Sahara Wash Entrance", lat: 36.1425, lng: -115.1560 },
];

const VEHICLES = [
  { id: 'v1', type: 'Sport Car', lat: 36.1120, lng: -115.1750 },
  { id: 'v2', type: 'Police Cruiser', lat: 36.1025, lng: -115.1728 },
  { id: 'v3', type: 'UFO', lat: 37.2350, lng: -115.8111 },
];

const POLICE_STATIONS = [
  { name: "LVPD Central (Reptilian HQ)", lat: 36.1675, lng: -115.1485 },
  { name: "Strip Substation (Pig Outpost)", lat: 36.1025, lng: -115.1728 },
];

const ICONS = [
  { id: 'default', label: 'Circle' },
  { id: 'star', label: 'Star', path: 'M 0,-10 L 2.35,-3.09 L 9.51,-3.09 L 3.71,1.12 L 5.88,8.09 L 0,3.82 L -5.88,8.09 L -3.71,1.12 L -9.51,-3.09 L -2.35,-3.09 Z' },
  { id: 'alien', label: 'Alien', path: 'M 0,-8 C -4,-8 -7,-4 -7,0 C -7,4 -4,8 0,8 C 4,8 7,4 7,0 C 7,-4 4,-8 0,-8 M -3,-2 C -3.5,-2 -4,-1.5 -4,-1 C -4,-0.5 -3.5,0 -3,0 C -2.5,0 -2,-0.5 -2,-1 C -2,-1.5 -2.5,-2 -3,-2 M 3,-2 C 2.5,-2 2,-1.5 2,-1 C 2,-0.5 2.5,0 3,0 C 3.5,0 4,-0.5 4,-1 C 4,-1.5 3.5,-2 3,-2' },
  { id: 'pig', label: 'Reptilian Pig', path: 'M 0,-7 C -4,-7 -7,-4 -7,0 C -7,4 -4,7 0,7 C 4,7 7,4 7,0 C 7,-4 4,-7 0,-7 M -3,-2 C -3.5,-2 -4,-1.5 -4,-1 C -4,-0.5 -3.5,0 -3,0 C -2.5,0 -2,-0.5 -2,-1 C -2,-1.5 -2.5,-2 -3,-2 M 3,-2 C 2.5,-2 2,-1.5 2,-1 C 2,-0.5 2.5,0 3,0 C 3.5,0 4,-0.5 4,-1 C 4,-1.5 3.5,-2 3,-2 M 0,1 C -1,1 -2,2 -2,3 C -2,4 -1,5 0,5 C 1,5 2,4 2,3 C 2,2 1,1 0,1' },
  { id: 'triangle', label: 'Triangle', path: 'M 0,-7 L 7,5 L -7,5 Z' },
];

const LAT_TO_METERS = 111320;
const LNG_TO_METERS = 111320 * Math.cos(VEGAS_CENTER.lat * Math.PI / 180);

const to3D = (lat: number, lng: number) => {
  return [
    (lng - VEGAS_CENTER.lng) * LNG_TO_METERS,
    0,
    -(lat - VEGAS_CENTER.lat) * LAT_TO_METERS
  ] as [number, number, number];
};

const from3D = (x: number, z: number) => {
  return {
    lat: VEGAS_CENTER.lat - (z / LAT_TO_METERS),
    lng: VEGAS_CENTER.lng + (x / LNG_TO_METERS)
  };
};

function GameWorld({ 
  playerPos, 
  setPlayerPos, 
  npcs, 
  weather, 
  onFire, 
  isDriving,
  wantedLevel
}: { 
  playerPos: { lat: number, lng: number }, 
  setPlayerPos: (pos: { lat: number, lng: number }) => void,
  npcs: GameNPC[],
  weather: WeatherType,
  onFire: () => void,
  isDriving: string | null,
  wantedLevel: number
}) {
  const { camera } = useThree();
  const moveSpeed = isDriving ? 50 : 15;
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current[e.key.toLowerCase()] = true;
    const up = (e: KeyboardEvent) => keys.current[e.key.toLowerCase()] = false;
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((state, delta) => {
    // Movement logic
    direction.current.z = Number(keys.current['w']) - Number(keys.current['s']);
    direction.current.x = Number(keys.current['d']) - Number(keys.current['a']);
    direction.current.normalize();

    if (keys.current['w'] || keys.current['s']) velocity.current.z -= direction.current.z * moveSpeed * delta;
    if (keys.current['a'] || keys.current['d']) velocity.current.x -= direction.current.x * moveSpeed * delta;

    // Apply movement relative to camera rotation, but keep Y fixed
    const moveVector = new THREE.Vector3(velocity.current.x, 0, velocity.current.z);
    moveVector.applyQuaternion(camera.quaternion);
    moveVector.y = 0; // Prevent flying/sinking
    
    camera.position.add(moveVector.multiplyScalar(delta));
    camera.position.y = 2; // Keep camera at fixed height
    
    velocity.current.multiplyScalar(0.9); // Friction

    // Update player pos for minimap and socket
    const pos = from3D(camera.position.x, camera.position.z);
    setPlayerPos(pos);
  });

  return (
    <>
      <Sky sunPosition={[100, 20, 100]} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      {/* Ground */}
      <Plane args={[2000, 2000]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <meshStandardMaterial color="#111" />
      </Plane>
      {/* Street Markings */}
      <gridHelper args={[2000, 100, "#333", "#222"]} position={[0, -0.99, 0]} />

      {/* Buildings (Procedural Vegas) */}
      {Array.from({ length: 100 }).map((_, i) => {
        const x = (Math.random() - 0.5) * 1000;
        const z = (Math.random() - 0.5) * 1000;
        const h = 20 + Math.random() * 100;
        return (
          <Box key={i} args={[10, h, 10]} position={[x, h / 2 - 1, z]}>
            <meshStandardMaterial color={i % 5 === 0 ? "#f0f" : "#222"} emissive={i % 5 === 0 ? "#505" : "#000"} />
          </Box>
        );
      })}

      {/* NPCs */}
      {npcs.map(npc => {
        const pos = to3D(npc.lat, npc.lng);
        return (
          <group key={npc.id} position={[pos[0], 0, pos[2]]}>
            <Sphere args={[0.5, 16, 16]} position={[0, 1, 0]}>
              <meshStandardMaterial color={npc.type === 'cop' ? "blue" : npc.type === 'alien' ? "green" : "white"} />
            </Sphere>
            {npc.thought && (
              <Text
                position={[0, 2.5, 0]}
                fontSize={0.2}
                color="white"
                anchorX="center"
                anchorY="middle"
              >
                {npc.thought}
              </Text>
            )}
          </group>
        );
      })}

      <PointerLockControls />
    </>
  );
}

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const streetViewRef = useRef<HTMLDivElement>(null);
  const googleMap = useRef<google.maps.Map | null>(null);
  const googleStreetView = useRef<google.maps.StreetViewPanorama | null>(null);
  const socket = useRef<Socket | null>(null);
  const markers = useRef<Record<string, google.maps.Marker>>({});
  const infoWindow = useRef<google.maps.InfoWindow | null>(null);
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [isDriving, setIsDriving] = useState<string | null>(null);
  const [health, setHealth] = useState(100);
  const [armor, setArmor] = useState(100);
  const [money, setMoney] = useState(1500);
  const [wantedLevel, setWantedLevel] = useState(0);
  const [weapon, setWeapon] = useState('Unarmed');
  const [isFiring, setIsFiring] = useState(false);
  const [radio, setRadio] = useState('Vegas Rock');
  const [isBusted, setIsBusted] = useState(false);
  const [dreamImage, setDreamImage] = useState<string | null>(null);
  const [isDreaming, setIsDreaming] = useState(false);
  const [weather, setWeather] = useState<WeatherType>('clear');
  const [activeNpcs, setActiveNpcs] = useState<GameNPC[]>([]);
  const [playerLatState, setPlayerLatState] = useState(VEGAS_CENTER.lat);
  const [playerLngState, setPlayerLngState] = useState(VEGAS_CENTER.lng);
  
  // RPG State
  const [stats, setStats] = useState<CharacterStats>({
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    level: 1, xp: 0
  });
  const [lastRoll, setLastRoll] = useState<{ value: number, die: number } | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [showCharacterSheet, setShowCharacterSheet] = useState(false);

  const rollDice = (sides: number) => {
    setIsRolling(true);
    setTimeout(() => {
      const result = Math.floor(Math.random() * sides) + 1;
      setLastRoll({ value: result, die: sides });
      setIsRolling(false);
      
      // Add to chat
      if (socket.current) {
        socket.current.emit('chat', `🎲 Rolled a d${sides}: ${result}`);
      }
    }, 600);
  };

  const moveInterval = useRef<NodeJS.Timeout | null>(null);
  const gameLoopInterval = useRef<NodeJS.Timeout | null>(null);
  const npcMarkers = useRef<Record<string, google.maps.Marker>>({});
  const keysPressed = useRef<Record<string, boolean>>({});

  const generateDreamFrame = async () => {
    setIsDreaming(true);
    try {
      const pos = { lat: playerLatState, lng: playerLngState };
      const address = "Las Vegas Strip"; // Simplified for now

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: `A high-quality, cinematic video game screenshot from GTA 6. The location is ${address} in Las Vegas. 
              View from a first-person perspective. 
              Night time with vibrant neon lights, wet asphalt reflecting lights, crowded streets with luxury cars and NPCs. 
              Hyper-realistic graphics, Unreal Engine 5 style, cinematic lighting, 4k resolution.`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
          },
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setDreamImage(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (error) {
      console.error("AI Generation failed:", error);
    } finally {
      setIsDreaming(false);
    }
  };
  
  // Profile state
  const [showSettings, setShowSettings] = useState(false);
  const [tempName, setTempName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('default');

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
      setApiKeyMissing(true);
      return;
    }

    setOptions({
      key: apiKey,
    });

    const initMap = async () => {
      try {
        await importLibrary('maps');
        await importLibrary('marker');
        await importLibrary('places');

        if (mapRef.current) {
          googleMap.current = new google.maps.Map(mapRef.current, {
            center: VEGAS_CENTER,
            zoom: 16,
            styles: darkMapStyle as google.maps.MapTypeStyle[],
            disableDefaultUI: true,
            zoomControl: true,
          });

          infoWindow.current = new google.maps.InfoWindow();

          // Add Area 51 Marker
          new google.maps.Marker({
            position: AREA_51,
            map: googleMap.current,
            title: "AREA 51 - TOP SECRET",
            icon: {
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 8,
              fillColor: "#00FF00",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#FFFFFF",
            },
            label: {
              text: "AREA 51",
              color: "#00FF00",
              fontWeight: "bold",
              fontSize: "14px"
            }
          });

          // Add Police Station Markers
          POLICE_STATIONS.forEach(ps => {
            new google.maps.Marker({
              position: { lat: ps.lat, lng: ps.lng },
              map: googleMap.current,
              title: ps.name,
              icon: {
                path: 'M 0,-7 C -4,-7 -7,-4 -7,0 C -7,4 -4,7 0,7 C 4,7 7,4 7,0 C 7,-4 4,-7 0,-7 M -3,-2 C -3.5,-2 -4,-1.5 -4,-1 C -4,-0.5 -3.5,0 -3,0 C -2.5,0 -2,-0.5 -2,-1 C -2,-1.5 -2.5,-2 -3,-2 M 3,-2 C 2.5,-2 2,-1.5 2,-1 C 2,-0.5 2.5,0 3,0 C 3.5,0 4,-0.5 4,-1 C 4,-1.5 3.5,-2 3,-2 M 0,1 C -1,1 -2,2 -2,3 C -2,4 -1,5 0,5 C 1,5 2,4 2,3 C 2,2 1,1 0,1',
                scale: 6,
                fillColor: "#FF0000",
                fillOpacity: 0.8,
                strokeWeight: 1,
                strokeColor: "#000000",
              },
              label: {
                text: "LVPD (CORRUPT)",
                color: "#FF0000",
                fontSize: "10px",
                fontWeight: "bold"
              }
            });
          });

          // Add Tunnel Entrance Markers
          TUNNEL_ENTRANCES.forEach(tunnel => {
            const marker = new google.maps.Marker({
              position: { lat: tunnel.lat, lng: tunnel.lng },
              map: googleMap.current,
              title: tunnel.name,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: "#4B2C20",
                fillOpacity: 0.9,
                strokeWeight: 2,
                strokeColor: "#000000",
              },
              label: {
                text: "TUNNEL ENTRANCE",
                color: "#FFA500",
                fontSize: "9px",
                fontWeight: "bold"
              }
            });

            marker.addListener('click', () => {
              if (infoWindow.current && googleMap.current) {
                const content = document.createElement('div');
                content.className = 'p-2 text-zinc-900 font-sans';
                content.innerHTML = `
                  <div class="mb-2">
                    <span class="font-bold text-amber-900">${tunnel.name}</span>
                    <p class="text-[10px] text-zinc-600 mt-1">Rumors say these lead to the secret base...</p>
                  </div>
                  <button id="enter-tunnel-btn" class="w-full bg-amber-900 text-white text-[10px] py-1 px-2 rounded uppercase tracking-wider font-bold hover:bg-amber-800 transition-colors">
                    Enter Tunnels
                  </button>
                `;
                
                infoWindow.current.setContent(content);
                infoWindow.current.open(googleMap.current, marker);
                
                google.maps.event.addListenerOnce(infoWindow.current, 'domready', () => {
                  document.getElementById('enter-tunnel-btn')?.addEventListener('click', () => {
                    // Teleport to Area 51 via tunnels
                    const pos = AREA_51;
                    if (socket.current) {
                      socket.current.emit('move', pos);
                      updateMyMarker(pos);
                    }
                    googleMap.current?.panTo(pos);
                    googleMap.current?.setZoom(16);
                    infoWindow.current?.close();
                  });
                });
              }
            });
          });

          // Add Tunnel Path (Visual only)
          new google.maps.Polyline({
            path: [TUNNEL_ENTRANCES[0], { lat: 36.5, lng: -115.5 }, AREA_51],
            geodesic: true,
            strokeColor: "#4B2C20",
            strokeOpacity: 0.3,
            strokeWeight: 4,
            map: googleMap.current,
          });

          // Add Vehicle Markers
          VEHICLES.forEach(v => {
            const marker = new google.maps.Marker({
              position: { lat: v.lat, lng: v.lng },
              map: googleMap.current,
              title: v.type,
              icon: {
                path: v.type === 'UFO' ? 'M 0,-5 C -5,-5 -8,-2 -8,2 C -8,5 -5,8 0,8 C 5,8 8,5 8,2 C 8,-2 5,-5 0,-5 M 0,-8 C -2,-8 -3,-7 -3,-5 C 3,-5 3,-8 0,-8' : 'M -7,2 L -7,5 L -5,5 L -5,7 L 5,7 L 5,5 L 7,5 L 7,2 L 5,2 L 5,0 L -5,0 L -5,2 Z',
                scale: 2,
                fillColor: v.type === 'UFO' ? '#00FF00' : '#FFD700',
                fillOpacity: 1,
                strokeWeight: 1,
                strokeColor: '#000000',
              },
              label: {
                text: `ENTER ${v.type.toUpperCase()}`,
                color: '#FFFFFF',
                fontSize: '8px',
                className: 'marker-label-vehicle'
              }
            });

            marker.addListener('click', () => {
              if (googleMap.current && socket.current) {
                const myId = socket.current.id;
                const myPlayer = players.find(p => p.id === myId);
                if (myPlayer) {
                  const dist = google.maps.geometry.spherical.computeDistanceBetween(
                    new google.maps.LatLng(myPlayer.lat, myPlayer.lng),
                    marker.getPosition()!
                  );
                  if (dist < 50) {
                    setIsDriving(v.type);
                    socket.current.emit('updateProfile', { name: myPlayer.name, icon: v.type === 'UFO' ? 'alien' : 'star' });
                  } else {
                    alert("Too far away to enter vehicle!");
                  }
                }
              }
            });
          });

          googleMap.current.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng && socket.current) {
              const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
              socket.current.emit('move', pos);
              updateMyMarker(pos);
              infoWindow.current?.close();
            }
          });

          setIsLoaded(true);
          initSocket();
        }
      } catch (error) {
        console.error("Error loading Google Maps:", error);
      }
    };

    initMap();

    // Initialize NPCs
    const initialNpcs: GameNPC[] = [
      { id: 'n1', name: 'Officer Pig', lat: 36.1150, lng: -115.1730, type: 'cop', health: 100 },
      { id: 'n2', name: 'Agent Smith', lat: 36.1100, lng: -115.1700, type: 'alien', health: 100 },
      { id: 'n3', name: 'Tourist Joe', lat: 36.1126, lng: -115.1767, type: 'civilian', health: 100 },
      { id: 'n4', name: 'Officer Ham', lat: 36.1025, lng: -115.1728, type: 'cop', health: 100 },
    ];
    setActiveNpcs(initialNpcs);

    // Game Loop for NPCs and Cops
    gameLoopInterval.current = setInterval(() => {
      setActiveNpcs(prev => {
        const playerPos = new google.maps.LatLng(playerLatState, playerLngState);
        if (!playerPos) return prev;

        return prev.map(npc => {
          let newLat = npc.lat;
          let newLng = npc.lng;

          if (npc.type === 'cop' && wantedLevel > 0) {
            // Chase player
            const angle = Math.atan2(playerPos.lat() - npc.lat, playerPos.lng() - npc.lng);
            newLat += Math.cos(angle) * 0.0002;
            newLng += Math.sin(angle) * 0.0002;
            
            // Damage player if too close
            const dist = google.maps.geometry.spherical.computeDistanceBetween(
              new google.maps.LatLng(newLat, newLng),
              playerPos
            );
            if (dist < 20) {
              setHealth(h => Math.max(0, h - 1));
            }
          } else {
            // Random roam
            newLat += (Math.random() - 0.5) * 0.0001;
            newLng += (Math.random() - 0.5) * 0.0001;
          }

          return { ...npc, lat: newLat, lng: newLng };
        });
      });
    }, 1000);

    return () => {
      socket.current?.disconnect();
      if (gameLoopInterval.current) clearInterval(gameLoopInterval.current);
    };
  }, [isDriving, wantedLevel, playerLatState, playerLngState]);

  // Sync player movement to socket and check wanted level
  useEffect(() => {
    if (socket.current) {
      const pos = { lat: playerLatState, lng: playerLngState };
      socket.current.emit('move', pos);
      updateMyMarker(pos);

      // Check for Wanted Level (near police stations)
      let nearPolice = false;
      POLICE_STATIONS.forEach(ps => {
        const dist = google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(playerLatState, playerLngState),
          new google.maps.LatLng(ps.lat, ps.lng)
        );
        if (dist < 100) nearPolice = true;
      });

      if (nearPolice) {
        setWantedLevel(prev => {
          const newLevel = Math.min(prev + 1, 5);
          if (newLevel === 5) setIsBusted(true);
          return newLevel;
        });
      } else if (Math.random() > 0.99) { // Slower decay
        setWantedLevel(prev => Math.max(prev - 1, 0));
      }
    }
  }, [playerLatState, playerLngState]);

  // Update NPC Markers
  useEffect(() => {
    if (!googleMap.current) return;

    activeNpcs.forEach(npc => {
      if (npcMarkers.current[npc.id]) {
        npcMarkers.current[npc.id].setPosition({ lat: npc.lat, lng: npc.lng });
      } else {
        const marker = new google.maps.Marker({
          position: { lat: npc.lat, lng: npc.lng },
          map: googleMap.current,
          title: npc.name,
          icon: {
            path: npc.type === 'cop' ? 'M 0,1 C -1,1 -2,2 -2,3 C -2,4 -1,5 0,5 C 1,5 2,4 2,3 C 2,2 1,1 0,1' : google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: npc.type === 'cop' ? "#FF0000" : npc.type === 'alien' ? "#00FF00" : "#FFFFFF",
            fillOpacity: 1,
            strokeWeight: 1,
            strokeColor: "#000000",
          },
          label: {
            text: npc.name,
            color: npc.type === 'cop' ? "#FF0000" : "#FFFFFF",
            fontSize: "8px",
            className: "marker-label-npc"
          }
        });

        marker.addListener('click', () => {
          if (weapon !== 'Unarmed') {
            handleFire();
            setMoney(prev => prev + 100);
            setWantedLevel(prev => Math.min(prev + 1, 5));
            // Damage NPC
            setActiveNpcs(prev => prev.map(n => n.id === npc.id ? { ...n, health: n.health - 50 } : n));
          } else {
            // AI Interaction
            generateNpcThought(npc);
          }
        });

        npcMarkers.current[npc.id] = marker;
      }
    });

    // Remove dead NPCs
    activeNpcs.forEach(npc => {
      if (npc.health <= 0 && npcMarkers.current[npc.id]) {
        npcMarkers.current[npc.id].setMap(null);
        delete npcMarkers.current[npc.id];
      }
    });
  }, [activeNpcs, weapon]);

  const generateNpcThought = async (npc: GameNPC) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are an NPC in a Las Vegas conspiracy game. Your name is ${npc.name} and you are a ${npc.type}. 
        The player just approached you. Give a short, cryptic, or funny one-line response about the reptilian conspiracy or the weather.`,
      });
      
      const thought = response.text?.trim() || "Move along, citizen.";
      setActiveNpcs(prev => prev.map(n => n.id === npc.id ? { ...n, thought } : n));
      
      // Clear thought after 5 seconds
      setTimeout(() => {
        setActiveNpcs(prev => prev.map(n => n.id === npc.id ? { ...n, thought: undefined } : n));
      }, 5000);
    } catch (e) {
      console.error(e);
    }
  };

  const initSocket = () => {
    socket.current = io();

    socket.current.on('init', (initialPlayers: Player[]) => {
      setPlayers(initialPlayers);
      initialPlayers.forEach(p => addOrUpdateMarker(p));
      const me = initialPlayers.find(p => p.id === socket.current?.id);
      if (me) {
        setTempName(me.name);
        setSelectedIcon(me.icon || 'default');
      }
    });

    socket.current.on('playerJoined', (player: Player) => {
      setPlayers(prev => [...prev, player]);
      addOrUpdateMarker(player);
    });

    socket.current.on('playerMoved', (player: Player) => {
      setPlayers(prev => prev.map(p => p.id === player.id ? player : p));
      addOrUpdateMarker(player);
    });

    socket.current.on('playerUpdated', (player: Player) => {
      setPlayers(prev => prev.map(p => p.id === player.id ? player : p));
      addOrUpdateMarker(player, true);
    });

    socket.current.on('playerLeft', (id: string) => {
      setPlayers(prev => prev.filter(p => p.id !== id));
      if (markers.current[id]) {
        markers.current[id].setMap(null);
        delete markers.current[id];
      }
    });

    socket.current.on('chatMessage', (msg: ChatMessage) => {
      setChat(prev => [...prev.slice(-50), msg]);
    });
  };

  const addOrUpdateMarker = (player: Player, forceRecreate = false) => {
    if (!googleMap.current) return;

    const isMe = player.id === socket.current?.id;
    const position = { lat: player.lat, lng: player.lng };
    const iconData = ICONS.find(i => i.id === player.icon) || ICONS[0];

    if (markers.current[player.id] && !forceRecreate) {
      markers.current[player.id].setPosition(position);
      markers.current[player.id].setTitle(player.name);
    } else {
      if (markers.current[player.id]) {
        markers.current[player.id].setMap(null);
      }

      const marker = new google.maps.Marker({
        position,
        map: googleMap.current,
        title: player.name,
        icon: {
          path: iconData.path || google.maps.SymbolPath.CIRCLE,
          fillColor: player.color,
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: '#FFFFFF',
          scale: isMe ? 10 : 7,
        },
        label: {
          text: player.name,
          color: '#FFFFFF',
          fontSize: '11px',
          fontWeight: '600',
          className: 'marker-label-full'
        }
      });

      marker.addListener('click', () => {
        if (infoWindow.current && googleMap.current) {
          const content = document.createElement('div');
          content.className = 'p-2 text-zinc-900 font-sans';
          content.innerHTML = `
            <div class="flex items-center gap-2 mb-2">
              <div class="w-3 h-3 rounded-full" style="background-color: ${player.color}"></div>
              <span class="font-bold">${player.name}</span>
            </div>
            <button id="center-btn" class="w-full bg-zinc-900 text-white text-[10px] py-1 px-2 rounded uppercase tracking-wider font-bold hover:bg-zinc-800 transition-colors">
              Center Map
            </button>
          `;
          
          infoWindow.current.setContent(content);
          infoWindow.current.open(googleMap.current, marker);
          
          // Add listener after window opens
          google.maps.event.addListenerOnce(infoWindow.current, 'domready', () => {
            document.getElementById('center-btn')?.addEventListener('click', () => {
              googleMap.current?.panTo(marker.getPosition()!);
              googleMap.current?.setZoom(17);
            });
          });
        }
      });

      markers.current[player.id] = marker;
    }
  };

  const updateMyMarker = (pos: { lat: number; lng: number }) => {
    const myId = socket.current?.id;
    if (myId && markers.current[myId]) {
      markers.current[myId].setPosition(pos);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && socket.current) {
      socket.current.emit('chat', message);
      setMessage('');
    }
  };

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim() && socket.current) {
      socket.current.emit('updateProfile', { name: tempName, icon: selectedIcon });
      setShowSettings(false);
    }
  };

  const clearChat = () => {
    setChat([]);
  };

  const handleFire = () => {
    if (weapon === 'Unarmed') return;
    
    setIsFiring(true);
    setTimeout(() => setIsFiring(false), 100);

    // RPG Combat Logic
    const d20 = Math.floor(Math.random() * 20) + 1;
    const dexMod = Math.floor((stats.dex - 10) / 2);
    const attackRoll = d20 + dexMod;
    
    setLastRoll({ value: d20, die: 20 });

    // Find nearest NPC
    const playerPos = new google.maps.LatLng(playerLatState, playerLngState);
    let nearestNpc: GameNPC | null = null;
    let minDist = 30; // Max range

    activeNpcs.forEach(npc => {
      const dist = google.maps.geometry.spherical.computeDistanceBetween(
        playerPos,
        new google.maps.LatLng(npc.lat, npc.lng)
      );
      if (dist < minDist) {
        minDist = dist;
        nearestNpc = npc;
      }
    });

    if (nearestNpc) {
      // AC is simplified to 12 for all NPCs for now
      if (attackRoll >= 12) {
        const strMod = Math.floor((stats.str - 10) / 2);
        const damage = (Math.floor(Math.random() * 8) + 1) + strMod; // 1d8 + STR
        
        setActiveNpcs(prev => prev.map(n => 
          n.id === nearestNpc?.id ? { ...n, health: n.health - damage } : n
        ));

        setMoney(prev => prev + 50);
        setWantedLevel(prev => Math.min(prev + 1, 5));

        // Check if killed
        if (nearestNpc.health - damage <= 0) {
          setStats(prev => ({ ...prev, xp: prev.xp + 100 }));
        }
      }
    }
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      handleFire();
    };
    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, [weapon]);

  if (apiKeyMissing) {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center text-white p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto border border-red-500/50">
            <MapPin className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-4xl font-bold tracking-tighter italic font-serif">VEGAS ROAM</h1>
          <p className="text-zinc-400">
            To start the game, you need a Google Maps API Key.
          </p>
          <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-left text-sm font-mono">
            <p className="text-zinc-500 mb-2"># Add this to your .env file:</p>
            <p className="text-emerald-400">VITE_GOOGLE_MAPS_API_KEY="your_key_here"</p>
          </div>
          <a 
            href="https://console.cloud.google.com/google/maps-apis/credentials" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 bg-white text-black rounded-full font-bold hover:bg-zinc-200 transition-colors"
          >
            Get API Key
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-zinc-950 overflow-hidden relative font-sans text-white">
      {/* 3D Game World */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 2, 0], fov: 75 }}>
          <GameWorld 
            playerPos={{ lat: playerLatState, lng: playerLngState }}
            setPlayerPos={(pos) => {
              setPlayerLatState(pos.lat);
              setPlayerLngState(pos.lng);
            }}
            npcs={activeNpcs}
            weather={weather}
            onFire={handleFire}
            isDriving={isDriving}
            wantedLevel={wantedLevel}
          />
        </Canvas>
      </div>

      {/* Crosshair */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
        <div className="w-4 h-4 border-2 border-white/50 rounded-full flex items-center justify-center">
          <div className="w-1 h-1 bg-white rounded-full" />
        </div>
      </div>

      {/* AI Dream Overlay */}
      <AnimatePresence>
        {isDreaming && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-4">
              <Sparkles className="w-12 h-12 text-emerald-500 animate-pulse" />
              <p className="text-white font-mono uppercase tracking-[0.3em] text-sm animate-pulse">Reimagining Reality...</p>
            </div>
          </motion.div>
        )}
        {dreamImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10"
          >
            <img src={dreamImage} className="w-full h-full object-cover" alt="AI Generated Frame" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            <button 
              onClick={() => setDreamImage(null)}
              className="absolute top-24 right-6 z-20 bg-black/60 backdrop-blur-md border border-white/10 p-2 rounded-full text-white hover:bg-black/80 transition-colors pointer-events-auto"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weather Overlays */}
      <AnimatePresence>
        {weather === 'rain' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 pointer-events-none bg-blue-900/10"
            style={{ backgroundImage: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)', backgroundSize: '2px 100px' }}
          />
        )}
        {weather === 'sandstorm' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 pointer-events-none bg-amber-900/20 backdrop-blur-[1px]"
          />
        )}
        {weather === 'glitch' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.2 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 pointer-events-none bg-emerald-500/10 mix-blend-overlay"
          />
        )}
      </AnimatePresence>

      {/* NPC Thought Bubbles */}
      <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
        {activeNpcs.map(npc => npc.thought && (
          <motion.div
            key={`thought-${npc.id}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bg-white text-black text-[10px] px-2 py-1 rounded-lg shadow-xl font-bold border border-zinc-300"
            style={{ 
              left: '50%', 
              top: '40%', 
              transform: 'translate(-50%, -50%)' 
            }}
          >
            {npc.thought}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 border-r border-b border-zinc-300" />
          </motion.div>
        ))}
      </div>

      {/* Map Container (Minimap) */}
      <div 
        ref={mapRef} 
        className="absolute bottom-6 right-6 w-48 h-48 rounded-full border-4 border-zinc-900 overflow-hidden pointer-events-none z-10 shadow-2xl"
      />

      {/* Muzzle Flash Effect */}
      <AnimatePresence>
        {isFiring && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-white pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Busted/Wasted Screens */}
      <AnimatePresence>
        {(isBusted || health <= 0) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center pointer-events-auto"
          >
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <h1 className={`text-8xl font-black italic tracking-tighter drop-shadow-[0_0_30px_rgba(255,255,255,0.5)] ${health <= 0 ? 'text-red-600' : 'text-blue-500'}`}>
                {health <= 0 ? 'WASTED' : 'BUSTED'}
              </h1>
              <p className="text-zinc-400 mt-4 font-mono uppercase tracking-[0.5em]">
                {health <= 0 ? 'The conspiracy claimed another victim' : 'The Reptilian Pigs got you'}
              </p>
              <button 
                onClick={() => {
                  setIsBusted(false);
                  setHealth(100);
                  setWantedLevel(0);
                  setMoney(prev => Math.max(0, prev - 500));
              if (googleMap.current) googleMap.current.panTo(VEGAS_CENTER);
                }}
                className="mt-8 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors"
              >
                Respawn
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD - Top Left */}
      <div className="absolute top-6 left-6 z-10 pointer-events-none flex flex-col gap-4">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-zinc-900/80 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-2xl pointer-events-auto"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]" />
            <h1 className="text-xl font-bold tracking-tighter italic font-serif text-emerald-400">VEGAS CONSPIRACY 3D</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono uppercase tracking-widest">
            <Users className="w-3 h-3" />
            <span>{players.length} Players Online</span>
          </div>
          <div className="mt-2 text-[10px] text-zinc-500 font-mono">
            CLICK TO LOCK MOUSE | ESC TO UNLOCK
          </div>
        </motion.div>

        {/* GTA Style Stats */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-2 pointer-events-auto"
        >
          <div className="w-48 h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/10">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${health}%` }}
              className="h-full bg-red-600"
            />
          </div>
          <div className="w-48 h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/10">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${armor}%` }}
              className="h-full bg-blue-600"
            />
          </div>
          {isDriving && (
            <div className="flex flex-col gap-1">
              <div className="bg-amber-500 text-black text-[10px] font-bold px-2 py-1 rounded uppercase tracking-tighter inline-block">
                Driving: {isDriving}
              </div>
              <div className="bg-zinc-900/80 backdrop-blur-md border border-white/10 px-2 py-1 rounded text-[9px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Navigation2 className="w-2 h-2 animate-spin" />
                <span>Radio: {radio}</span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Wanted Level Stars */}
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(star => (
            <motion.div
              key={star}
              animate={{ 
                scale: star <= wantedLevel ? [1, 1.2, 1] : 1,
                opacity: star <= wantedLevel ? 1 : 0.2
              }}
              transition={{ repeat: star <= wantedLevel ? Infinity : 0, duration: 1 }}
              className={`w-6 h-6 ${star <= wantedLevel ? 'text-amber-400' : 'text-zinc-600'}`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            </motion.div>
          ))}
        </div>
      </div>

      {/* HUD - Top Right (Money & Weapon) */}
      <div className="absolute top-6 right-6 z-10 flex flex-col items-end gap-4 pointer-events-none">
        <div className="text-right">
          <motion.div 
            key={money}
            initial={{ scale: 1.2, color: '#10b981' }}
            animate={{ scale: 1, color: '#10b981' }}
            className="text-4xl font-bold font-mono tracking-tighter"
          >
            ${money.toLocaleString()}
          </motion.div>
          <div className="text-zinc-400 text-xs font-mono uppercase tracking-widest">
            {weapon}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const weapons = ['Unarmed', 'Baseball Bat', 'Pistol', 'Alien Blaster'];
              const nextIdx = (weapons.indexOf(weapon) + 1) % weapons.length;
              setWeapon(weapons[nextIdx]);
            }}
            className="bg-zinc-900/80 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-2xl pointer-events-auto text-white hover:bg-zinc-800 transition-colors"
            title="Switch Weapon"
          >
            <Navigation2 className="w-5 h-5 rotate-45" />
          </motion.button>

          {isDriving && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const stations = ['Vegas Rock', 'Alien FM', 'Pig Beats', 'Desert Jazz'];
                const nextIdx = (stations.indexOf(radio) + 1) % stations.length;
                setRadio(stations[nextIdx]);
              }}
              className="bg-zinc-900/80 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-2xl pointer-events-auto text-amber-400 hover:bg-zinc-800 transition-colors"
              title="Switch Radio"
            >
              <Navigation2 className="w-5 h-5" />
            </motion.button>
          )}

          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={generateDreamFrame}
            disabled={isDreaming}
            className={`bg-zinc-900/80 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-2xl pointer-events-auto transition-colors ${isDreaming ? 'text-emerald-500 animate-pulse' : 'text-white hover:text-emerald-400'}`}
            title="AI Dream Mode (GTA-ify)"
          >
            <Sparkles className="w-5 h-5" />
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const weathers: WeatherType[] = ['clear', 'rain', 'sandstorm', 'glitch'];
              const nextIdx = (weathers.indexOf(weather) + 1) % weathers.length;
              setWeather(weathers[nextIdx]);
            }}
            className="bg-zinc-900/80 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-2xl pointer-events-auto text-white hover:bg-zinc-800 transition-colors"
            title="Change Weather"
          >
            <Sparkles className={`w-5 h-5 ${weather !== 'clear' ? 'text-emerald-400' : ''}`} />
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCharacterSheet(true)}
            className="bg-zinc-900/80 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-2xl pointer-events-auto text-white hover:bg-zinc-800 transition-colors"
            title="Character Sheet"
          >
            <User className="w-5 h-5" />
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => rollDice(20)}
            disabled={isRolling}
            className={`bg-zinc-900/80 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-2xl pointer-events-auto transition-colors ${isRolling ? 'animate-bounce text-emerald-400' : 'text-white hover:text-emerald-400'}`}
            title="Roll D20"
          >
            <Dices className="w-5 h-5" />
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowSettings(true)}
            className="bg-zinc-900/80 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-2xl pointer-events-auto text-white hover:bg-zinc-800 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </motion.button>
        </div>
        
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-900/80 backdrop-blur-md border border-white/10 p-3 rounded-xl text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <Navigation2 className="w-3 h-3 text-emerald-500" />
            <span>WASD to Move</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-emerald-500" />
            <span>Click Sparkles for AI Vision</span>
          </div>
          <button 
            onClick={() => {
              googleMap.current?.panTo(AREA_51);
              googleMap.current?.setZoom(14);
              if (googleStreetView.current) {
                googleStreetView.current.setPosition(AREA_51);
              }
            }}
            className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-500/40 transition-colors pointer-events-auto"
          >
            Teleport to Area 51
          </button>
        </motion.div>
      </div>

      {/* Character Sheet Modal */}
      <AnimatePresence>
        {showCharacterSheet && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
                    <User className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">Character Sheet</h2>
                    <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Level {stats.level} Operative</p>
                  </div>
                </div>
                <button onClick={() => setShowCharacterSheet(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'STR', val: stats.str, icon: Sword, color: 'text-red-400' },
                    { label: 'DEX', val: stats.dex, icon: Zap, color: 'text-yellow-400' },
                    { label: 'CON', val: stats.con, icon: Heart, color: 'text-emerald-400' },
                    { label: 'INT', val: stats.int, icon: Brain, color: 'text-blue-400' },
                    { label: 'WIS', val: stats.wis, icon: Shield, color: 'text-purple-400' },
                    { label: 'CHA', val: stats.cha, icon: StarIcon, color: 'text-pink-400' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-zinc-800/50 border border-white/5 p-3 rounded-2xl text-center space-y-1">
                      <stat.icon className={`w-4 h-4 mx-auto ${stat.color}`} />
                      <div className="text-[10px] text-zinc-500 font-bold uppercase">{stat.label}</div>
                      <div className="text-xl font-mono font-bold">{stat.val}</div>
                      <div className="text-[9px] text-zinc-600">MOD: {Math.floor((stat.val - 10) / 2)}</div>
                    </div>
                  ))}
                </div>

                {/* Experience Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    <span>Experience</span>
                    <span>{stats.xp} / {stats.level * 1000} XP</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(stats.xp / (stats.level * 1000)) * 100}%` }}
                      className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981]"
                    />
                  </div>
                </div>

                {/* Dice Roller Quick Actions */}
                <div className="space-y-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Quick Rolls</div>
                  <div className="flex gap-2">
                    {[4, 6, 8, 10, 12, 20].map(d => (
                      <button 
                        key={d}
                        onClick={() => rollDice(d)}
                        className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-white/5 py-2 rounded-xl text-xs font-mono transition-colors"
                      >
                        d{d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {lastRoll && (
                <div className="px-8 pb-8">
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Dices className="w-5 h-5 text-emerald-500" />
                      <span className="text-sm font-medium">Last Roll (d{lastRoll.die})</span>
                    </div>
                    <span className="text-2xl font-mono font-bold text-emerald-500">{lastRoll.value}</span>
                  </motion.div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSettings && (
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-xl font-bold tracking-tight">Profile Settings</h2>
                </div>
                <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleUpdateProfile} className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Display Name</label>
                  <input 
                    type="text" 
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                    placeholder="Enter your name..."
                    maxLength={20}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Marker Icon</label>
                  <div className="grid grid-cols-5 gap-2">
                    {ICONS.map((icon) => (
                      <button
                        key={icon.id}
                        type="button"
                        onClick={() => setSelectedIcon(icon.id)}
                        className={`aspect-square rounded-xl border flex items-center justify-center transition-all ${
                          selectedIcon === icon.id 
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' 
                            : 'bg-zinc-950 border-white/10 text-zinc-500 hover:border-white/20'
                        }`}
                      >
                        <svg viewBox="-10 -10 20 20" className="w-6 h-6 fill-current">
                          <path d={icon.path || 'M 0,0 m -5,0 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0'} />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-xl font-bold transition-colors"
                >
                  Save Changes
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Chat - Bottom Left */}
      <div className="absolute bottom-6 left-6 z-10 w-80 max-h-[40vh] flex flex-col pointer-events-none">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
        >
          <div className="p-3 border-bottom border-white/5 bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">Live Chat</span>
            </div>
            <button 
              onClick={clearChat}
              className="p-1 hover:bg-white/10 rounded transition-colors text-zinc-500 hover:text-red-400"
              title="Clear Chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[100px] max-h-[200px] scrollbar-hide">
            {chat.map((msg, i) => (
              <div key={i} className="text-xs animate-in fade-in slide-in-from-bottom-1 group">
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="font-bold" style={{ color: msg.color }}>{msg.name}</span>
                  <span className="text-[9px] text-zinc-600 font-mono">{msg.timestamp}</span>
                </div>
                <div className="text-zinc-300 bg-white/5 p-2 rounded-lg rounded-tl-none inline-block max-w-full break-words">
                  {msg.message}
                </div>
              </div>
            ))}
            {chat.length === 0 && (
              <div className="text-[10px] text-zinc-500 italic font-mono uppercase text-center py-4">No messages yet...</div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-2 border-t border-white/5 flex gap-2">
            <input 
              type="text" 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-black p-1.5 rounded-lg transition-colors">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </motion.div>
      </div>

      {/* Loading Overlay */}
      {!isLoaded && !apiKeyMissing && (
        <div className="absolute inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-emerald-500">Initializing Vegas...</p>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .marker-label-full {
          background-color: rgba(0, 0, 0, 0.7);
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          transform: translateY(-25px);
          white-space: nowrap;
        }
        .gm-style-iw {
          background-color: #ffffff !important;
          border-radius: 12px !important;
          padding: 0 !important;
        }
        .gm-style-iw-d {
          overflow: hidden !important;
        }
        .gm-style-iw-tc::after {
          background-color: #ffffff !important;
        }
      `}} />
    </div>
  );
}

const darkMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#212121" }] },
  { "administrative": { "elementType": "geometry", "stylers": [{ "color": "#757575" }] } },
  { "administrative.country": { "elementType": "geometry.stroke", "stylers": [{ "color": "#9e9e9e" }] } },
  { "administrative.land_parcel": { "stylers": [{ "visibility": "off" }] } },
  { "administrative.locality": { "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] } },
  { "poi": { "elementType": "geometry", "stylers": [{ "color": "#181818" }] } },
  { "poi": { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] } },
  { "poi.park": { "elementType": "geometry", "stylers": [{ "color": "#181818" }] } },
  { "poi.park": { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] } },
  { "poi.park": { "elementType": "labels.text.stroke", "stylers": [{ "color": "#1b1b1b" }] } },
  { "road": { "elementType": "geometry.fill", "stylers": [{ "color": "#2c2c2c" }] } },
  { "road": { "elementType": "labels.text.fill", "stylers": [{ "color": "#8a8a8a" }] } },
  { "road.arterial": { "elementType": "geometry", "stylers": [{ "color": "#373737" }] } },
  { "road.highway": { "elementType": "geometry", "stylers": [{ "color": "#3c3c3c" }] } },
  { "road.highway.controlled_access": { "elementType": "geometry", "stylers": [{ "color": "#4e4e4e" }] } },
  { "road.local": { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] } },
  { "transit": { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] } },
  { "water": { "elementType": "geometry", "stylers": [{ "color": "#000000" }] } },
  { "water": { "elementType": "labels.text.fill", "stylers": [{ "color": "#3d3d3d" }] } }
];
