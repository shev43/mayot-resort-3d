import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

// ============================================================
// MAYOT RESORT — 3D BIM VIEWER
// ============================================================

const COLORS = {
    s1a: 0x2B5C3F,        // Зелений MAYOT
    s2: 0xC4A882,          // Дуб натуральний
    s3: 0x9B8E7E,          // Камінь теплий
    water: 0x4A90D9,       // Водні об'єкти
    amenity: 0xE8DFD5,     // Amenities
    service: 0x555555,     // Service LEFT
    road: 0x444444,        // Дорога
    glass: 0x88BBDD,       // Скло
    wood: 0xA08060,        // Дерево фасад
    stone: 0x8B7D6B,       // Камінь фасад
    terrain: 0x4A6741,     // Рельєф
    contour: 0xFFFFFF,     // Горизонталі
    guestBelt: 0x3A6B3A,   // Guest belt зелений
    deck: 0x8B6914,        // Дерев'яний deck
};

// MAYOT palette
const PALETTE = {
    white: 0xFAF8F5,
    sand: 0xE8DFD5,
    oak: 0xC4A882,
    stone: 0x9B8E7E,
    green: 0x2B5C3F,
    black: 0x2C2C2C,
};

let scene, camera, renderer, controls;
let terrainMesh, contourGroup, labelGroup, treeGroup, zoneGroup;
let buildingGroups = { s1a: null, s2: null, s3: null };
let elevData = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let clickableObjects = [];
let tooltip;

// Site reference frame
let siteOrigin = { lat: 0, lon: 0 };
let mPerDegLat, mPerDegLon;
let siteWidth, siteHeight;

// ============================================================
// INIT
// ============================================================
async function init() {
    updateProgress(10);

    // Load elevation data
    const resp = await fetch('js/data/elevation.json');
    elevData = await resp.json();
    updateProgress(30);

    mPerDegLat = elevData.m_per_deg_lat;
    mPerDegLon = elevData.m_per_deg_lon;
    siteWidth = elevData.site_dims.width_m;
    siteHeight = elevData.site_dims.height_m;
    siteOrigin.lat = elevData.bounds.site_min_lat;
    siteOrigin.lon = elevData.bounds.site_min_lon;

    // Setup Three.js
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2a1a);
    scene.fog = new THREE.FogExp2(0x1a2a1a, 0.0008);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 5000);
    camera.position.set(-250, 300, 350);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.getElementById('viewer-container').appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(siteWidth / 2, 40, -siteHeight / 2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 50;
    controls.maxDistance = 1200;

    // Lighting — south-facing slope, sun from south
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xFFF4E0, 1.2);
    dirLight.position.set(100, 250, 200); // South-ish light
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(4096, 4096);
    dirLight.shadow.camera.left = -400;
    dirLight.shadow.camera.right = 400;
    dirLight.shadow.camera.top = 400;
    dirLight.shadow.camera.bottom = -400;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 1000;
    scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0x88BBFF, 0x446622, 0.3);
    scene.add(hemiLight);

    updateProgress(40);

    // Build terrain
    buildTerrain();
    updateProgress(55);

    // Build contours
    contourGroup = buildContours();
    scene.add(contourGroup);
    updateProgress(60);

    // Build zone indicators
    zoneGroup = buildZones();
    scene.add(zoneGroup);

    // Build buildings
    buildAllBuildings();
    updateProgress(80);

    // Build trees
    treeGroup = buildTrees();
    scene.add(treeGroup);
    updateProgress(90);

    // Labels
    labelGroup = buildLabels();
    scene.add(labelGroup);

    // Tooltip
    tooltip = document.createElement('div');
    tooltip.id = 'tooltip';
    document.body.appendChild(tooltip);

    // Events
    setupEvents();
    updateProgress(100);

    // Hide loading
    setTimeout(() => {
        document.getElementById('loading').classList.add('fade-out');
        setTimeout(() => document.getElementById('loading').style.display = 'none', 600);
    }, 500);

    // Debug: expose for console inspection
    window.__scene = scene;
    window.__clickable = clickableObjects;
    window.__THREE = THREE;

    // Start render loop
    animate();
}

function updateProgress(pct) {
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = pct + '%';
}

// ============================================================
// COORDINATE CONVERSION
// Chainage: ch.0 = south (bottom), ch.400 = north (top)
// Width: LEFT=west (x=0), RIGHT=east (x=siteWidth)
// Three.js: X = west-east (width), Z = -north (chainage goes -Z), Y = up
// ============================================================
function chainageToZ(ch) {
    // ch.0 at south (z=0), ch.400 at north (z=-siteHeight)
    return -(ch / 400) * siteHeight;
}

function widthToX(w) {
    // w=0 at LEFT (west), w=siteWidth at RIGHT (east)
    return w;
}

function getElevationAt(x, z) {
    // Convert 3D coords back to lat/lon, then sample elevation grid
    const fracX = x / ((elevData.bounds.max_lon - elevData.bounds.min_lon) * mPerDegLon);
    const fracZ = (-z) / ((elevData.bounds.max_lat - elevData.bounds.min_lat) * mPerDegLat);

    // Offset for site position within extended grid
    const siteOffsetX = (elevData.bounds.site_min_lon - elevData.bounds.min_lon) * mPerDegLon;
    const siteOffsetZ = (elevData.bounds.site_min_lat - elevData.bounds.min_lat) * mPerDegLat;

    const gridX = ((x + siteOffsetX) / ((elevData.bounds.max_lon - elevData.bounds.min_lon) * mPerDegLon)) * (elevData.grid.cols - 1);
    const gridZ = ((-z + siteOffsetZ) / ((elevData.bounds.max_lat - elevData.bounds.min_lat) * mPerDegLat)) * (elevData.grid.rows - 1);

    const col = Math.min(Math.max(Math.floor(gridX), 0), elevData.grid.cols - 2);
    const row = Math.min(Math.max(Math.floor(gridZ), 0), elevData.grid.rows - 2);

    const fx = gridX - col;
    const fz = gridZ - row;

    const e00 = elevData.elevations[row][col] || 940;
    const e10 = elevData.elevations[row][col + 1] || 940;
    const e01 = elevData.elevations[row + 1]?.[col] || 940;
    const e11 = elevData.elevations[row + 1]?.[col + 1] || 940;

    return e00 * (1 - fx) * (1 - fz) + e10 * fx * (1 - fz) + e01 * (1 - fx) * fz + e11 * fx * fz;
}

function getTerrainY(ch, w) {
    // Linear interpolation: ch.0 = 920m, ch.400 = 1000m
    const baseElev = 920 + (ch / 400) * 80;
    return baseElev - 920; // Y offset from base
}

// ============================================================
// TERRAIN
// ============================================================
function buildTerrain() {
    const cols = elevData.grid.cols;
    const rows = elevData.grid.rows;
    const totalW = elevData.grid.width_m;
    const totalH = elevData.grid.height_m;

    // Offset to center site in extended terrain
    const siteOffsetX = (elevData.bounds.site_min_lon - elevData.bounds.min_lon) * mPerDegLon;
    const siteOffsetZ = (elevData.bounds.site_min_lat - elevData.bounds.min_lat) * mPerDegLat;

    const geo = new THREE.PlaneGeometry(totalW, totalH, cols - 1, rows - 1);
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position.array;
    const colors = new Float32Array(positions.length);

    const baseElev = 855; // Мінімум з даних

    for (let i = 0; i < positions.length; i += 3) {
        const col = (i / 3) % cols;
        const row = Math.floor((i / 3) / cols);

        const elev = elevData.elevations[rows - 1 - row]?.[col] || 920;
        positions[i + 1] = (elev - baseElev) * 1.0; // Y = elevation, scale 1:1

        // Color by elevation
        const t = Math.max(0, Math.min(1, (elev - 870) / 170));
        // Forest green gradient
        const r = 0.15 + t * 0.25;
        const g = 0.30 + t * 0.15 - Math.abs(t - 0.5) * 0.1;
        const b = 0.12 + t * 0.08;

        colors[i] = r;
        colors[i + 1] = g;
        colors[i + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.0,
        flatShading: false,
    });

    terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;

    // Position: center of extended grid aligns with site
    terrainMesh.position.set(
        totalW / 2 - siteOffsetX,
        0,
        -(totalH / 2 - siteOffsetZ)
    );

    scene.add(terrainMesh);

    // Site boundary polygon
    const polyPoints = elevData.polygon.map(p => {
        const x = (p[1] - elevData.bounds.site_min_lon) * mPerDegLon;
        const z = -((p[0] - elevData.bounds.site_min_lat) * mPerDegLat);
        const elev = sampleTerrainY(x, z);
        return new THREE.Vector3(x, elev + 1.5, z);
    });

    const polyGeo = new THREE.BufferGeometry().setFromPoints(polyPoints);
    const polyLine = new THREE.Line(polyGeo, new THREE.LineBasicMaterial({ color: 0xFFCC00, linewidth: 2 }));
    scene.add(polyLine);
}

// ============================================================
// CONTOUR LINES
// ============================================================
function buildContours() {
    const group = new THREE.Group();
    const baseElev = 855;

    // Generate contour lines every 10m from 860 to 1040
    for (let elev = 860; elev <= 1040; elev += 10) {
        const points = [];
        const y = elev - baseElev;

        // Trace contour across terrain
        const cols = elevData.grid.cols;
        const rows = elevData.grid.rows;
        const totalW = elevData.grid.width_m;
        const totalH = elevData.grid.height_m;
        const siteOffsetX = (elevData.bounds.site_min_lon - elevData.bounds.min_lon) * mPerDegLon;
        const siteOffsetZ = (elevData.bounds.site_min_lat - elevData.bounds.min_lat) * mPerDegLat;

        // March through grid cells looking for contour crossings
        for (let row = 0; row < rows - 1; row++) {
            const segments = [];
            for (let col = 0; col < cols - 1; col++) {
                const e00 = elevData.elevations[row][col] || 0;
                const e10 = elevData.elevations[row][col + 1] || 0;
                const e01 = elevData.elevations[row + 1]?.[col] || 0;
                const e11 = elevData.elevations[row + 1]?.[col + 1] || 0;

                if (!e00 || !e10 || !e01 || !e11) continue;

                // Check all 4 edges for contour crossing
                const cellPoints = [];

                // Bottom edge (row, col -> col+1)
                if ((e00 <= elev && e10 > elev) || (e00 > elev && e10 <= elev)) {
                    const t = (elev - e00) / (e10 - e00);
                    const cx = (col + t) / (cols - 1) * totalW - siteOffsetX;
                    const cz = -(row / (rows - 1) * totalH - siteOffsetZ);
                    cellPoints.push(new THREE.Vector3(cx, y + 0.5, cz));
                }
                // Top edge
                if ((e01 <= elev && e11 > elev) || (e01 > elev && e11 <= elev)) {
                    const t = (elev - e01) / (e11 - e01);
                    const cx = (col + t) / (cols - 1) * totalW - siteOffsetX;
                    const cz = -((row + 1) / (rows - 1) * totalH - siteOffsetZ);
                    cellPoints.push(new THREE.Vector3(cx, y + 0.5, cz));
                }
                // Left edge
                if ((e00 <= elev && e01 > elev) || (e00 > elev && e01 <= elev)) {
                    const t = (elev - e00) / (e01 - e00);
                    const cx = col / (cols - 1) * totalW - siteOffsetX;
                    const cz = -((row + t) / (rows - 1) * totalH - siteOffsetZ);
                    cellPoints.push(new THREE.Vector3(cx, y + 0.5, cz));
                }
                // Right edge
                if ((e10 <= elev && e11 > elev) || (e10 > elev && e11 <= elev)) {
                    const t = (elev - e10) / (e11 - e10);
                    const cx = (col + 1) / (cols - 1) * totalW - siteOffsetX;
                    const cz = -((row + t) / (rows - 1) * totalH - siteOffsetZ);
                    cellPoints.push(new THREE.Vector3(cx, y + 0.5, cz));
                }

                if (cellPoints.length >= 2) {
                    segments.push([cellPoints[0], cellPoints[1]]);
                }
            }

            // Add segments as lines
            for (const seg of segments) {
                points.push(seg[0], seg[1]);
            }
        }

        if (points.length > 0) {
            const isMajor = elev % 50 === 0;
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({
                color: isMajor ? 0xFFFFFF : 0xAAAAAA,
                transparent: true,
                opacity: isMajor ? 0.5 : 0.25,
            });
            const line = new THREE.LineSegments(geo, mat);
            group.add(line);

            // Add elevation label for major contours
            if (isMajor && points.length > 4) {
                const midPt = points[Math.floor(points.length / 2)];
                const sprite = makeTextSprite(`${elev}м`, { fontSize: 14, color: '#ffffff' });
                sprite.position.copy(midPt);
                sprite.position.y += 2;
                group.add(sprite);
            }
        }
    }

    return group;
}

// ============================================================
// TEXT SPRITES
// ============================================================
function makeTextSprite(text, opts = {}) {
    const fontSize = opts.fontSize || 16;
    const color = opts.color || '#ffffff';
    const bgColor = opts.bgColor || 'rgba(0,0,0,0.5)';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    ctx.fillStyle = bgColor;
    ctx.roundRect(0, 0, canvas.width, canvas.height, 6);
    ctx.fill();

    ctx.font = `bold ${fontSize * 2}px Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(24, 6, 1);
    return sprite;
}

// ============================================================
// ZONES (LEFT / CENTER / RIGHT) + ROAD NETWORK
// ============================================================
function buildZones() {
    const group = new THREE.Group();

    const leftW = 16;
    const rightW = 24;

    // Semi-transparent zone overlays
    [
        { x: 0, w: leftW, color: 0x666666, opacity: 0.15 },
        { x: siteWidth - rightW, w: rightW, color: 0x2B5C3F, opacity: 0.15 },
    ].forEach(z => {
        const planeGeo = new THREE.PlaneGeometry(z.w, siteHeight);
        planeGeo.rotateX(-Math.PI / 2);
        const planeMat = new THREE.MeshBasicMaterial({
            color: z.color, transparent: true, opacity: z.opacity, side: THREE.DoubleSide
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.position.set(z.x + z.w / 2, 80 + 0.2, -siteHeight / 2);
        group.add(plane);
    });

    // ---- ROAD HELPERS ----

    function makeRoad(points, width, color, opacity) {
        if (points.length < 2) return;
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
        group.add(new THREE.Line(geo, mat));

        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i], p1 = points[i + 1];
            const dx = p1.x - p0.x, dz = p1.z - p0.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len < 0.1) continue;
            const nx = -dz / len * width / 2, nz = dx / len * width / 2;
            const verts = new Float32Array([
                p0.x - nx, p0.y + 0.15, p0.z - nz,
                p0.x + nx, p0.y + 0.15, p0.z + nz,
                p1.x + nx, p1.y + 0.15, p1.z + nz,
                p1.x - nx, p1.y + 0.15, p1.z - nz,
            ]);
            const segGeo = new THREE.BufferGeometry();
            segGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            segGeo.setIndex([0, 1, 2, 0, 2, 3]);
            segGeo.computeVertexNormals();
            group.add(new THREE.Mesh(segGeo, new THREE.MeshStandardMaterial({
                color, transparent: true, opacity: opacity || 0.7,
                roughness: 0.95, side: THREE.DoubleSide
            })));
        }
    }

    function terrainPt(x, z) {
        const y = sampleTerrainY(x, z);
        return new THREE.Vector3(x, y, z);
    }

    // Create smooth road from 2D waypoints using CatmullRomCurve3
    function smoothRoad(waypoints, numSamples, width, color, opacity) {
        // waypoints: [{x, ch}, ...] — build 3D control points
        const controlPts = waypoints.map(w => {
            const z = chainageToZ(w.ch);
            return new THREE.Vector3(w.x, sampleTerrainY(w.x, z), z);
        });
        const curve = new THREE.CatmullRomCurve3(controlPts);
        // Sample curve and re-project Y to terrain
        const sampled = curve.getPoints(numSamples).map(p => {
            p.y = sampleTerrainY(p.x, p.z) + 0.3;
            return p;
        });
        makeRoad(sampled, width, color, opacity);
    }

    // ---- 1. SERVICE ROAD — LEFT spine (x ≈ 8m), straight ----
    const serviceRoadPts = [];
    for (let ch = 10; ch <= 395; ch += 5) {
        serviceRoadPts.push(terrainPt(8, chainageToZ(ch)));
    }
    makeRoad(serviceRoadPts, 4.5, 0x555555, 0.8);

    // ---- 2. MAIN GUEST ROAD — smooth curves (Catmull-Rom) ----
    // South segment: Gate (ch.200) → bottom of S3
    smoothRoad([
        { x: 18, ch: 200 },   // gate
        { x: 50, ch: 185 },   // curve east
        { x: 80, ch: 165 },   // into S3
        { x: 95, ch: 140 },   // wide curve east
        { x: 80, ch: 115 },   // curve back
        { x: 95, ch: 90 },    // second curve
        { x: 80, ch: 65 },    // curve back
        { x: 95, ch: 42 },    // bottom
    ], 80, 5.5, 0x666666, 0.7);

    // North segment: Gate (ch.200) → S1A top
    smoothRoad([
        { x: 18, ch: 200 },   // gate
        { x: 40, ch: 220 },   // curve east into S2
        { x: 65, ch: 250 },   // mid S2
        { x: 55, ch: 280 },   // curve back
        { x: 45, ch: 310 },   // S2/S1A buffer
        { x: 38, ch: 340 },   // enter S1A
        { x: 30, ch: 370 },   // mid S1A
        { x: 24, ch: 395 },   // top
    ], 60, 5.5, 0x666666, 0.7);

    // ---- 3. GUEST PROMENADE — along east edge, wooden boardwalk ----
    const promenadePts = [];
    for (let ch = 30; ch <= 385; ch += 5) {
        const bounds = getSiteBounds(ch);
        const px = Math.min(bounds.xMax - 6, siteWidth - 10);
        promenadePts.push(terrainPt(px, chainageToZ(ch)));
    }
    makeRoad(promenadePts, 3, COLORS.deck, 0.6);

    // ---- 4. CROSS PATHS — connecting service to promenade ----
    [60, 100, 150, 200, 260, 310, 365].forEach(ch => {
        const bounds = getSiteBounds(ch);
        const crossPts = [];
        for (let x = 12; x <= bounds.xMax - 8; x += 6) {
            crossPts.push(terrainPt(x, chainageToZ(ch)));
        }
        makeRoad(crossPts, 1.5, 0x777766, 0.35);
    });

    // ---- 5. INTERNAL PATHS within S3 (curved, connecting buildings) ----
    smoothRoad([
        { x: 45, ch: 180 },
        { x: 60, ch: 150 },
        { x: 80, ch: 120 },
        { x: 65, ch: 90 },
        { x: 75, ch: 60 },
    ], 40, 2, 0x777766, 0.4);

    smoothRoad([
        { x: 90, ch: 190 },
        { x: 110, ch: 160 },
        { x: 120, ch: 130 },
        { x: 110, ch: 100 },
        { x: 105, ch: 70 },
    ], 40, 2, 0x777766, 0.4);

    return group;
}

// ============================================================
// BUILDINGS
// ============================================================
function buildAllBuildings() {
    const baseElev = 920 - 855; // Offset: terrain base is at 855, site starts at 920

    buildingGroups.s1a = buildStage1A(baseElev);
    buildingGroups.s2 = buildStage2(baseElev);
    buildingGroups.s3 = buildStage3(baseElev);

    scene.add(buildingGroups.s1a);
    scene.add(buildingGroups.s2);
    scene.add(buildingGroups.s3);

    // Entry gates at ch.200
    buildEntryGates(baseElev);
}

function sampleTerrainY(x, z) {
    // Sample real elevation from grid and convert to Three.js Y
    const elev = getElevationAt(x, z);
    return elev - 855;
}

// Site polygon in local coords (computed from KMZ polygon)
let sitePolyLocal = [];
function initSitePoly() {
    sitePolyLocal = elevData.polygon.map(p => ({
        x: (p[1] - elevData.bounds.site_min_lon) * mPerDegLon,
        z: -((p[0] - elevData.bounds.site_min_lat) * mPerDegLat),
    }));
}

// Get available x range at a given chainage
function getSiteBounds(ch) {
    if (sitePolyLocal.length === 0) initSitePoly();
    const targetZ = chainageToZ(ch);
    const intersections = [];
    const n = sitePolyLocal.length;
    for (let i = 0; i < n - 1; i++) {
        const p1 = sitePolyLocal[i], p2 = sitePolyLocal[i + 1];
        if ((p1.z <= targetZ && p2.z >= targetZ) || (p2.z <= targetZ && p1.z >= targetZ)) {
            if (Math.abs(p2.z - p1.z) > 0.01) {
                const t = (targetZ - p1.z) / (p2.z - p1.z);
                intersections.push(p1.x + t * (p2.x - p1.x));
            }
        }
    }
    if (intersections.length >= 2) {
        return { xMin: Math.min(...intersections), xMax: Math.max(...intersections) };
    }
    // Fallback
    return { xMin: 0, xMax: siteWidth };
}

// Clamp a building to fit within site polygon at its chainage
function clampBuilding(x, width, ch, margin) {
    margin = margin || 3;
    const bounds = getSiteBounds(ch);
    let cx = x;
    if (cx < bounds.xMin + margin) cx = bounds.xMin + margin;
    if (cx + width > bounds.xMax - margin) cx = bounds.xMax - margin - width;
    return cx;
}

function createBuilding(params) {
    const { name, x, z, width, depth, floors, floorH, color, stage, info, terraceDepth, cascadeOffset } = params;
    const group = new THREE.Group();
    // Sample real terrain at building center for accurate seating
    const centerX = x + width / 2;
    const centerZ = z - depth / 2;
    const baseY = sampleTerrainY(centerX, centerZ);

    const totalH = floors * floorH;
    const cascade = cascadeOffset || 0;

    for (let f = 0; f < floors; f++) {
        const floorWidth = width - f * cascade * 2;
        const floorDepth = depth - f * cascade;
        const floorX = x + f * cascade;

        // Main floor volume
        const geo = new THREE.BoxGeometry(floorWidth, floorH - 0.3, floorDepth);
        const mat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.7,
            metalness: 0.1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            floorX + floorWidth / 2,
            baseY + f * floorH + floorH / 2,
            z - floorDepth / 2
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { name, stage, info, clickable: true };
        clickableObjects.push(mesh);
        group.add(mesh);

        // Terrace per floor — SOUTH face (+Z), towards panorama/downhill
        if (terraceDepth && terraceDepth > 0) {
            const tGeo = new THREE.BoxGeometry(floorWidth, 0.2, terraceDepth);
            const tMat = new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.8 });
            const terrace = new THREE.Mesh(tGeo, tMat);
            terrace.position.set(
                floorX + floorWidth / 2,
                baseY + f * floorH + 0.1,
                z + terraceDepth / 2
            );
            terrace.castShadow = true;
            group.add(terrace);

            // Glass railing on south edge of terrace
            const railGeo = new THREE.BoxGeometry(floorWidth, 1.1, 0.05);
            const railMat = new THREE.MeshPhysicalMaterial({
                color: COLORS.glass, transparent: true, opacity: 0.3,
                roughness: 0.1, metalness: 0.0
            });
            const rail = new THREE.Mesh(railGeo, railMat);
            rail.position.set(
                floorX + floorWidth / 2,
                baseY + f * floorH + 0.6,
                z + terraceDepth
            );
            group.add(rail);
        }

        // Window strips — SOUTH face (+Z), panoramic glazing towards valley
        const winGeo = new THREE.BoxGeometry(floorWidth - 1, floorH * 0.6, 0.1);
        const winMat = new THREE.MeshPhysicalMaterial({
            color: 0x88BBDD, transparent: true, opacity: 0.4,
            roughness: 0.05, metalness: 0.3,
        });
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(
            floorX + floorWidth / 2,
            baseY + f * floorH + floorH * 0.45,
            z + 0.05
        );
        group.add(win);
    }

    // Flat roof (Japandi style) — extends over terrace on south side
    const td = terraceDepth || 0;
    const roofGeo = new THREE.BoxGeometry(width, 0.3, depth + td);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(
        x + width / 2,
        baseY + totalH + 0.15,
        z - depth / 2 + td / 2
    );
    roof.castShadow = true;
    group.add(roof);

    return group;
}

function createWaterFeature(params) {
    const { name, x, z, width, depth, info, stage } = params;
    const group = new THREE.Group();
    const baseY = sampleTerrainY(x + width / 2, z - depth / 2);

    // Water basin
    const geo = new THREE.BoxGeometry(width, 0.8, depth);
    const mat = new THREE.MeshPhysicalMaterial({
        color: 0x2288AA,
        transparent: true,
        opacity: 0.7,
        roughness: 0.0,
        metalness: 0.1,
        clearcoat: 1.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + width / 2, baseY + 0.4, z - depth / 2);
    mesh.userData = { name, stage, info, clickable: true };
    clickableObjects.push(mesh);
    group.add(mesh);

    // Deck around water
    const deckGeo = new THREE.BoxGeometry(width + 4, 0.15, depth + 4);
    const deckMat = new THREE.MeshStandardMaterial({ color: COLORS.deck, roughness: 0.8 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(x + width / 2, baseY + 0.05, z - depth / 2);
    group.add(deck);

    return group;
}

function createPavilion(params) {
    const { name, x, z, width, depth, floors, info, stage } = params;
    const group = new THREE.Group();
    const baseY = sampleTerrainY(x + width / 2, z - depth / 2);
    const floorH = 4.5;
    const nFloors = floors || 1;

    // Main structure
    const geo = new THREE.BoxGeometry(width, floorH * nFloors, depth);
    const mat = new THREE.MeshStandardMaterial({
        color: PALETTE.sand, roughness: 0.6, metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + width / 2, baseY + (floorH * nFloors) / 2, z - depth / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { name, stage, info, clickable: true };
    clickableObjects.push(mesh);
    group.add(mesh);

    // Overhanging roof
    const roofGeo = new THREE.BoxGeometry(width + 6, 0.4, depth + 6);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(x + width / 2, baseY + floorH * nFloors + 0.2, z - depth / 2);
    roof.castShadow = true;
    group.add(roof);

    // Stone base
    const stoneGeo = new THREE.BoxGeometry(width + 1, 1, depth + 1);
    const stoneMat = new THREE.MeshStandardMaterial({ color: PALETTE.stone, roughness: 0.95 });
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.set(x + width / 2, baseY + 0.5, z - depth / 2);
    group.add(stone);

    return group;
}

// ============================================================
// STAGE 1A — SPA Retreat (ch.320-400, 30 keys)
// Compact hilltop cluster per architectural sketch
// ============================================================
function buildStage1A(baseElev) {
    const group = new THREE.Group();

    // --- AMENITY CLUSTER (ch.325-345) — center of buildable area ---
    const b325 = getSiteBounds(325);
    const cx1a = (b325.xMin + b325.xMax) / 2; // center of polygon at this chainage

    // Pavilion S1A — 250 м²
    group.add(createPavilion({
        name: 'Pavilion S1A (Lobby + F&B)',
        x: clampBuilding(cx1a - 12, 22, 328, 4), z: chainageToZ(328),
        width: 22, depth: 12, floors: 1,
        stage: 's1a',
        info: { type: 'Pavilion S1A', area: '250 м²', functions: 'Lobby, ресторан (60 місць), bar, WC', kitchen: '87 м²', note: 'Japandi інтер\'єр, 2700K' }
    }));

    // SPA Indoor — 80 м² (east of Pavilion)
    group.add(createPavilion({
        name: 'SPA Indoor S1A',
        x: clampBuilding(cx1a + 14, 10, 328, 4), z: chainageToZ(328),
        width: 10, depth: 8, floors: 1,
        stage: 's1a',
        info: { type: 'SPA Indoor', area: '80 м²', treatments: '2 treatment rooms, reception' }
    }));

    // Onsen Deck — 205 м²
    group.add(createWaterFeature({
        name: 'Onsen Deck (термальний)',
        x: clampBuilding(cx1a - 8, 16, 342, 4), z: chainageToZ(342),
        width: 16, depth: 14,
        stage: 's1a',
        info: { type: 'Onsen Deck', area: '205 м²', components: 'Термальна чаша 60м² (39°C), cold plunge 8м² (10°C), сауна 55м², deck 82м²', note: '18+ only' }
    }));

    // --- RESIDENTIAL (ch.355-398) — terraced rows following contours ---
    // S42 Junior Suites — 24 units as 3 long row-buildings (8 units each)
    // Each row follows the terrain contour (wide E-W, narrow N-S)
    let suiteNum = 0;
    const s42Rows = [
        { ch: 358, unitsTarget: 8 },
        { ch: 372, unitsTarget: 8 },
        { ch: 386, unitsTarget: 8 },
    ];
    s42Rows.forEach((row) => {
        const bounds = getSiteBounds(row.ch);
        const m52Reserve = 28; // reserve right side for M52 suites
        const availW = bounds.xMax - bounds.xMin - 10 - m52Reserve;
        const unitW = 7, gap = 2;
        const n = Math.min(row.unitsTarget, Math.max(2, Math.floor(availW / (unitW + gap))));
        const totalW = n * unitW + (n - 1) * gap;
        const startX = bounds.xMin + 5;
        for (let col = 0; col < n; col++) {
            suiteNum++;
            group.add(createBuilding({
                name: `S42 Junior Suite #${suiteNum}`,
                x: startX + col * (unitW + gap), z: chainageToZ(row.ch),
                width: unitW, depth: 7,
                floors: 2, floorH: 3.2, color: COLORS.s1a,
                stage: 's1a', terraceDepth: 3, cascadeOffset: 0.5,
                info: { type: 'S42 Junior Suite', net: '42 м²', terrace: '12 м²', sellable: '45.6 м²', features: 'Сауна 2×2м, deep bath, kitchenette' }
            }));
        }
    });

    // M52 Master Suites — 6 units (premium positions, BETWEEN S42 rows)
    const m52Rows = [366, 380, 394];
    m52Rows.forEach((ch, idx) => {
        const bounds = getSiteBounds(ch);
        for (let col = 0; col < 2; col++) {
            const x = bounds.xMax - 5 - 9 - col * 13;
            group.add(createBuilding({
                name: `M52 Master Suite #${idx * 2 + col + 1}`,
                x: clampBuilding(x, 9, ch, 4), z: chainageToZ(ch),
                width: 9, depth: 8,
                floors: 2, floorH: 3.2, color: 0x1E4A30,
                stage: 's1a', terraceDepth: 4, cascadeOffset: 0.5,
                info: { type: 'M52 Master Suite', net: '52 м²', terrace: '18 м²', sellable: '57.4 м²', features: '2 кімнати, кутова позиція, сауна' }
            }));
        }
    });

    // Underground parking
    const parkGeo = new THREE.BoxGeometry(35, 3, 25);
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x333333, transparent: true, opacity: 0.4 });
    const parkMesh = new THREE.Mesh(parkGeo, parkMat);
    parkMesh.position.set(cx1a, sampleTerrainY(cx1a, chainageToZ(335)) - 4, chainageToZ(335));
    parkMesh.userData = { name: 'Підземний паркінг S1A', stage: 's1a', clickable: true, info: { type: 'Паркінг', spots: '40 місць', area: '924 м² GBA' } };
    clickableObjects.push(parkMesh);
    group.add(parkMesh);

    // Label
    const label = makeTextSprite('STAGE 1A — SPA RETREAT', { fontSize: 18, color: '#2B5C3F', bgColor: 'rgba(0,0,0,0.7)' });
    label.position.set(cx1a, sampleTerrainY(cx1a, chainageToZ(365)) + 25, chainageToZ(365));
    label.scale.set(36, 9, 1);
    group.add(label);

    return group;
}

// ============================================================
// STAGE 2 — Mountain Lodge (ch.200-320, 48 keys)
// Parallel terraced rows following contours per sketch
// ============================================================
function buildStage2(baseElev) {
    const group = new THREE.Group();

    // --- STD40: 3 long terraced row buildings (parallel, stepping down slope) ---
    // Each building wide along E-W contour, 12 units (4/floor × 3 floors)
    const std40Layout = [
        { ch: 218, x: 30, w: 40 },   // lowest row, wider
        { ch: 248, x: 28, w: 42 },   // middle row
        { ch: 280, x: 26, w: 44 },   // upper row, widest (polygon wider here)
    ];
    std40Layout.forEach((row, block) => {
        const x = clampBuilding(row.x, row.w, row.ch, 5);
        group.add(createBuilding({
            name: `Std40 Block ${block + 1} (12 units)`,
            x, z: chainageToZ(row.ch), width: row.w, depth: 13,
            floors: 3, floorH: 3.2, color: COLORS.s2,
            stage: 's2', terraceDepth: 3, cascadeOffset: 1,
            info: { type: 'Std40 Standard Block', units: '12 юнітів (4/поверх × 3)', net: '40 м²', terrace: '10 м²', sellable: '43.0 м²' }
        }));
    });

    // --- DLX50: 1 block (6 units), east of middle Std40 row ---
    group.add(createBuilding({
        name: 'Dlx50 Deluxe Block (6 units)',
        x: clampBuilding(78, 28, 248, 5), z: chainageToZ(248),
        width: 28, depth: 12,
        floors: 3, floorH: 3.2, color: 0xB89872,
        stage: 's2', terraceDepth: 4, cascadeOffset: 1,
        info: { type: 'Dlx50 Deluxe Block', units: '6 юнітів', net: '50 м²', terrace: '15 м²', sellable: '54.5 м²' }
    }));

    // --- CHALETS: 6 standalone, scattered east side (ch.215-260) ---
    const chaletPositions = [
        { ch: 215, x: 80 }, { ch: 215, x: 98 },
        { ch: 235, x: 82 }, { ch: 235, x: 100 },
        { ch: 260, x: 80 }, { ch: 260, x: 98 },
    ];
    chaletPositions.forEach((pos, i) => {
        group.add(createBuilding({
            name: `Chalet80 #${i + 1}`,
            x: clampBuilding(pos.x, 12, pos.ch, 5), z: chainageToZ(pos.ch),
            width: 12, depth: 10, floors: 2, floorH: 3.5, color: COLORS.wood,
            stage: 's2', terraceDepth: 5, cascadeOffset: 0.3,
            info: { type: 'Chalet80', net: '80 м²', terrace: '30 м²', sellable: '89.0 м²', features: '2 спальні, кухня, приватна тераса' }
        }));
    });

    // --- AMENITIES (ch.265-310, east of Std40 blocks) ---
    // Pavilion S2 — 360 м²
    group.add(createPavilion({
        name: 'Pavilion S2 (Lobby + F&B)',
        x: clampBuilding(78, 28, 270, 5), z: chainageToZ(270),
        width: 28, depth: 13, floors: 1,
        stage: 's2',
        info: { type: 'Pavilion S2', area: '360 м²', functions: 'Lobby, ресторан, bar, кухня 82м²' }
    }));

    // SPA S2 — 400 м²
    group.add(createPavilion({
        name: 'SPA S2',
        x: clampBuilding(78, 22, 288, 5), z: chainageToZ(288),
        width: 22, depth: 18, floors: 1,
        stage: 's2',
        info: { type: 'SPA S2', area: '400 м²', treatments: '5 treatment rooms, сауна, hammam' }
    }));

    // Water Cascade — 280 м² (adjacent to SPA, further east)
    group.add(createWaterFeature({
        name: 'Water Cascade',
        x: clampBuilding(103, 20, 288, 5), z: chainageToZ(288),
        width: 20, depth: 14,
        stage: 's2',
        info: { type: 'Water Cascade', area: '280 м²', components: '3 чаші 36/38/40°C, каскадний перелив' }
    }));

    // Kids outdoor S2 — 192 м²
    group.add(createPavilion({
        name: 'Kids Outdoor S2',
        x: clampBuilding(80, 16, 305, 5), z: chainageToZ(305),
        width: 16, depth: 12, floors: 1,
        stage: 's2',
        info: { type: 'Kids Area S2', area: '192 м² outdoor + 80 м² indoor' }
    }));

    // Underground parking
    const parkGeo = new THREE.BoxGeometry(40, 3, 30);
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x333333, transparent: true, opacity: 0.4 });
    const park2 = new THREE.Mesh(parkGeo, parkMat);
    park2.position.set(55, sampleTerrainY(55, chainageToZ(250)) - 4, chainageToZ(250));
    park2.userData = { name: 'Підземний паркінг S2', stage: 's2', clickable: true, info: { type: 'Паркінг', spots: '40 місць', area: '924 м² GBA' } };
    clickableObjects.push(park2);
    group.add(park2);

    // Label
    const label = makeTextSprite('STAGE 2 — MOUNTAIN LODGE', { fontSize: 18, color: '#C4A882', bgColor: 'rgba(0,0,0,0.7)' });
    label.position.set(70, sampleTerrainY(70, chainageToZ(260)) + 25, chainageToZ(260));
    label.scale.set(40, 10, 1);
    group.add(label);

    return group;
}

// ============================================================
// STAGE 3 — Family Resort (ch.0-200, 135 keys)
// Curved amphitheater arrangement per architectural sketch
// ============================================================
function buildStage3(baseElev) {
    const group = new THREE.Group();

    // S3 uses curved rows inspired by the architectural sketch:
    // Buildings arranged along gentle arcs following terrain contours,
    // with amenities in center-south and residential fanning out north.

    // --- AMENITY CORE (ch.35-85) ---

    // Water World — 1,500 м² (center-south of S3)
    group.add(createWaterFeature({
        name: 'Water World',
        x: clampBuilding(55, 45, 42, 5), z: chainageToZ(42),
        width: 45, depth: 28,
        stage: 's3',
        info: { type: 'Water World', area: '1,500 м²', components: 'Водна площа 280м², splash, baby zone', note: 'Найбільший водний атрактор Карпат' }
    }));

    // Kids City — 1,280 м² (above Water World, separated)
    group.add(createPavilion({
        name: 'Kids City',
        x: clampBuilding(105, 26, 72, 5), z: chainageToZ(72),
        width: 26, depth: 16, floors: 2,
        stage: 's3',
        info: { type: 'Kids City', area: '1,280 м²', zones: '0-3, 3-6, 6-12 років', note: 'Канатний парк, скеледром, petting farm' }
    }));

    // Main Pavilion S3 — 700 м² (above Water World, central position)
    group.add(createPavilion({
        name: 'Main Pavilion S3 (Lobby + F&B)',
        x: clampBuilding(50, 38, 78, 5), z: chainageToZ(78),
        width: 38, depth: 18, floors: 2,
        stage: 's3',
        info: { type: 'Main Pavilion S3', area: '700 м²', functions: '6 F&B концептів, lobby, bar', kitchen: '169 м²' }
    }));

    // --- RESIDENTIAL CURVED ROWS (ch.98-195) ---

    // Family50 — 105 units in 7 blocks
    // Arranged in curved rows: blocks alternate between inner arc (left) and outer arc (right)
    // creating amphitheater pattern visible in sketch
    const family50Layout = [
        { ch: 98,  x: 40 },   // row 1 left
        { ch: 98,  x: 85 },   // row 1 right
        { ch: 120, x: 35 },   // row 2 left
        { ch: 120, x: 82 },   // row 2 right
        { ch: 142, x: 32 },   // row 3 left
        { ch: 164, x: 35 },   // row 4 left
        { ch: 186, x: 38 },   // row 5 left (near S2 boundary)
    ];
    family50Layout.forEach((pos, block) => {
        group.add(createBuilding({
            name: `Family50 Block ${block + 1} (15 units)`,
            x: clampBuilding(pos.x, 35, pos.ch, 5), z: chainageToZ(pos.ch),
            width: 35, depth: 13,
            floors: 3, floorH: 3.2, color: COLORS.s3,
            stage: 's3', terraceDepth: 3, cascadeOffset: 1.2,
            info: { type: 'Family50 Block', units: '15 юнітів (5/поверх × 3)', net: '50 м²', terrace: '10 м²', sellable: '53.0 м²' }
        }));
    });

    // XL65 — 18 units (2 blocks, on the right arc)
    [{ ch: 140, x: 105 }, { ch: 165, x: 100 }].forEach((pos, block) => {
        group.add(createBuilding({
            name: `XL65 Block ${block + 1} (9 units)`,
            x: clampBuilding(pos.x, 28, pos.ch, 5), z: chainageToZ(pos.ch),
            width: 28, depth: 13,
            floors: 3, floorH: 3.2, color: 0x8A7B6B,
            stage: 's3', terraceDepth: 4, cascadeOffset: 1,
            info: { type: 'XL65 Block', units: '9 юнітів', net: '65 м²', terrace: '18 м²', sellable: '70.4 м²' }
        }));
    });

    // Chalet80 S3 — 12 units (scattered on periphery, right arc)
    const chaletS3 = [
        { ch: 100, x: 130 }, { ch: 100, x: 148 },
        { ch: 116, x: 130 }, { ch: 116, x: 148 },
        { ch: 155, x: 138 }, { ch: 155, x: 156 },
        { ch: 172, x: 135 }, { ch: 172, x: 153 },
        { ch: 135, x: 140 }, { ch: 135, x: 158 },
        { ch: 145, x: 150 }, { ch: 188, x: 120 },
    ];
    chaletS3.forEach((pos, i) => {
        group.add(createBuilding({
            name: `Chalet80 S3 #${i + 1}`,
            x: clampBuilding(pos.x, 12, pos.ch, 5), z: chainageToZ(pos.ch),
            width: 12, depth: 10,
            floors: 2, floorH: 3.5, color: COLORS.wood,
            stage: 's3', terraceDepth: 5, cascadeOffset: 0.3,
            info: { type: 'Chalet80', net: '80 м²', terrace: '30 м²', sellable: '89.0 м²', features: '2 спальні, кухня, приватна тераса' }
        }));
    });

    // Adult SPA 18+ — 500 м² (north-east of S3, far from Kids City)
    group.add(createPavilion({
        name: 'Adult SPA 18+',
        x: clampBuilding(82, 26, 192, 5), z: chainageToZ(192),
        width: 26, depth: 18, floors: 1,
        stage: 's3',
        info: { type: 'Adult SPA 18+', area: '500 м²', treatments: '11 treatment rooms, infinity pool', note: '18+ only, ізольований від Kids City' }
    }));

    // Underground parking (below amenity core)
    const parkGeo = new THREE.BoxGeometry(60, 3, 40);
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x333333, transparent: true, opacity: 0.4 });
    const park3 = new THREE.Mesh(parkGeo, parkMat);
    park3.position.set(75, sampleTerrainY(75, chainageToZ(55)) - 4, chainageToZ(55));
    park3.userData = {
        name: 'Підземний паркінг S3', stage: 's3', clickable: true,
        info: { type: 'Паркінг', spots: '185 + 31 staff', area: '4,174 м² GBA', note: 'EV charger 19 точок' }
    };
    clickableObjects.push(park3);
    group.add(park3);

    // Label
    const label = makeTextSprite('STAGE 3 — FAMILY RESORT', { fontSize: 18, color: '#9B8E7E', bgColor: 'rgba(0,0,0,0.7)' });
    label.position.set(80, sampleTerrainY(80, chainageToZ(130)) + 25, chainageToZ(130));
    label.scale.set(40, 10, 1);
    group.add(label);

    return group;
}

// ============================================================
// ENTRY GATES (ch.200)
// ============================================================
function buildEntryGates(baseElev) {
    const ch = 200;
    const z = chainageToZ(ch);

    // Guest Gate
    const gateGeo = new THREE.BoxGeometry(8, 4, 3);
    const gateMat = new THREE.MeshStandardMaterial({ color: PALETTE.stone, roughness: 0.8 });
    const guestGate = new THREE.Mesh(gateGeo, gateMat);
    guestGate.position.set(4, sampleTerrainY(4, z) + 2, z);
    guestGate.userData = {
        name: 'Guest Gate', stage: 'infra', clickable: true,
        info: {
            type: 'Guest Gate',
            location: 'ch.200 (LEFT side)',
            features: 'Arrival plaza, шлагбаум, камера, valet parking',
            design: 'Натуральний камінь, вода, 2700K освітлення, MAYOT signage',
        }
    };
    clickableObjects.push(guestGate);
    scene.add(guestGate);

    // Service Gate (offset)
    const serviceGate = new THREE.Mesh(
        new THREE.BoxGeometry(6, 3, 3),
        new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 })
    );
    serviceGate.position.set(4, sampleTerrainY(4, z + 12) + 1.5, z + 12);
    serviceGate.userData = {
        name: 'Service Gate', stage: 'infra', clickable: true,
        info: {
            type: 'Service Gate',
            location: 'ch.200 (LEFT side, окремий)',
            access: 'Доставка, будтехніка, trash, staff, екстрені служби',
        }
    };
    clickableObjects.push(serviceGate);
    scene.add(serviceGate);

    // Gate labels
    const gl = makeTextSprite('GUEST GATE', { fontSize: 14, color: '#C4A882' });
    gl.position.copy(guestGate.position).add(new THREE.Vector3(0, 5, 0));
    scene.add(gl);

    const sl = makeTextSprite('SERVICE GATE', { fontSize: 12, color: '#888' });
    sl.position.copy(serviceGate.position).add(new THREE.Vector3(0, 4, 0));
    scene.add(sl);
}

// ============================================================
// TREES
// ============================================================
function buildTrees() {
    const group = new THREE.Group();
    const baseElev = 920 - 855;

    // Tree generator — simple cone + cylinder (Carpathian conifers)
    function addTree(x, z, scale = 1) {
        const y = sampleTerrainY(x, z);

        const trunkGeo = new THREE.CylinderGeometry(0.3 * scale, 0.5 * scale, 3 * scale, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5C3A1E });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, y + 1.5 * scale, z);
        trunk.castShadow = true;
        group.add(trunk);

        const crownGeo = new THREE.ConeGeometry(2.5 * scale, 8 * scale, 6);
        const crownMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.28 + Math.random() * 0.06, 0.5, 0.2 + Math.random() * 0.1),
            roughness: 0.9
        });
        const crown = new THREE.Mesh(crownGeo, crownMat);
        crown.position.set(x, y + 6 * scale, z);
        crown.castShadow = true;
        group.add(crown);
    }

    // Trees on RIGHT guest belt (24m zone, from east edge)
    for (let ch = 5; ch <= 395; ch += 12) {
        for (let i = 0; i < 3; i++) {
            const x = siteWidth - 20 + Math.random() * 16;
            const z = chainageToZ(ch + Math.random() * 10);
            addTree(x, z, 0.7 + Math.random() * 0.5);
        }
    }

    // Trees between buildings (forest context)
    for (let ch = 5; ch <= 395; ch += 15) {
        for (let i = 0; i < 2; i++) {
            const x = siteWidth + 10 + Math.random() * 40; // Beyond site to east
            const z = chainageToZ(ch + Math.random() * 12);
            addTree(x, z, 0.8 + Math.random() * 0.6);
        }
    }

    // Dense forest beyond site boundary
    for (let i = 0; i < 200; i++) {
        const x = -30 + Math.random() * (siteWidth + 100);
        const z = chainageToZ(Math.random() * 450 - 25);
        // Skip if inside build zone
        if (x > 20 && x < siteWidth - 20 && z < chainageToZ(-5) && z > chainageToZ(405)) continue;
        addTree(x, z, 0.5 + Math.random() * 0.8);
    }

    return group;
}

// ============================================================
// LABELS
// ============================================================
function buildLabels() {
    const group = new THREE.Group();
    const baseElev = 920 - 855;

    // Chainage markers
    for (let ch = 0; ch <= 400; ch += 50) {
        const z = chainageToZ(ch);
        const y = sampleTerrainY(0, z) + 3;
        const label = makeTextSprite(`ch.${ch}`, { fontSize: 12, color: '#888', bgColor: 'rgba(0,0,0,0.6)' });
        label.position.set(-5, y, z);
        label.scale.set(16, 4, 1);
        group.add(label);
    }

    // Zone labels along width
    const midCh = 200;
    const midZ = chainageToZ(midCh);
    const midY = sampleTerrainY(siteWidth / 2, midZ) + 35;

    const leftLabel = makeTextSprite('LEFT (Service)', { fontSize: 12, color: '#888' });
    leftLabel.position.set(8, midY, midZ);
    leftLabel.scale.set(20, 5, 1);
    group.add(leftLabel);

    const centerLabel = makeTextSprite('CENTER (Build Zone)', { fontSize: 12, color: '#aaa' });
    centerLabel.position.set(siteWidth / 2, midY, midZ);
    centerLabel.scale.set(28, 7, 1);
    group.add(centerLabel);

    const rightLabel = makeTextSprite('RIGHT (Guest Belt)', { fontSize: 12, color: '#2B5C3F' });
    rightLabel.position.set(siteWidth - 12, midY, midZ);
    rightLabel.scale.set(24, 6, 1);
    group.add(rightLabel);

    // North arrow
    const northLabel = makeTextSprite('N ↑', { fontSize: 20, color: '#cc4444', bgColor: 'rgba(0,0,0,0.7)' });
    northLabel.position.set(siteWidth / 2, midY + 20, chainageToZ(400) + 20);
    northLabel.scale.set(12, 6, 1);
    group.add(northLabel);

    return group;
}

// ============================================================
// EVENTS & UI
// ============================================================
function setupEvents() {
    // Click on buildings
    renderer.domElement.addEventListener('click', onMouseClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);

    // View buttons
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const view = btn.dataset.view;
            setView(view);
        });
    });

    // Toggle checkboxes
    document.getElementById('toggleContours').addEventListener('change', e => {
        contourGroup.visible = e.target.checked;
    });
    document.getElementById('toggleLabels').addEventListener('change', e => {
        labelGroup.visible = e.target.checked;
    });
    document.getElementById('toggleTrees').addEventListener('change', e => {
        treeGroup.visible = e.target.checked;
    });
    document.getElementById('toggleZones').addEventListener('change', e => {
        zoneGroup.visible = e.target.checked;
    });

    // Close info panel
    document.getElementById('closeInfo').addEventListener('click', () => {
        document.getElementById('info-panel').classList.add('hidden');
    });
}

function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects, true);

    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData?.clickable) obj = obj.parent;
        if (obj && obj.userData?.info) {
            showInfoPanel(obj.userData);
        }
    }
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects, true);

    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData?.clickable) obj = obj.parent;
        if (obj && obj.userData?.name) {
            tooltip.style.display = 'block';
            tooltip.style.left = event.clientX + 12 + 'px';
            tooltip.style.top = event.clientY + 12 + 'px';
            tooltip.textContent = obj.userData.name;
            document.body.style.cursor = 'pointer';
        }
    } else {
        tooltip.style.display = 'none';
        document.body.style.cursor = 'default';
    }
}

function showInfoPanel(data) {
    const panel = document.getElementById('info-panel');
    const title = document.getElementById('infoTitle');
    const content = document.getElementById('infoContent');

    title.textContent = data.name;

    let html = '';
    if (data.info) {
        for (const [key, value] of Object.entries(data.info)) {
            const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
            html += `<div class="info-row"><span>${label}:</span><span>${value}</span></div>`;
        }
    }
    if (data.stage) {
        const stageNames = { s1a: 'Stage 1A', s2: 'Stage 2', s3: 'Stage 3', infra: 'Infrastructure' };
        html += `<div class="info-section"><h5>Стадія</h5><div class="info-row"><span>Belongs to:</span><span>${stageNames[data.stage] || data.stage}</span></div></div>`;
    }

    content.innerHTML = html;
    panel.classList.remove('hidden');
}

function setView(view) {
    const baseElev = 920 - 855;

    if (view === 'all') {
        buildingGroups.s1a.visible = true;
        buildingGroups.s2.visible = true;
        buildingGroups.s3.visible = true;
        camera.position.set(-250, 300, 350);
        controls.target.set(siteWidth / 2, baseElev + 40, -siteHeight / 2);
    } else if (view === 's1a') {
        buildingGroups.s1a.visible = true;
        buildingGroups.s2.visible = false;
        buildingGroups.s3.visible = false;
        camera.position.set(siteWidth / 2 + 100, baseElev + 120, chainageToZ(360) + 100);
        controls.target.set(siteWidth / 2, sampleTerrainY(siteWidth / 2, chainageToZ(370)), chainageToZ(370));
    } else if (view === 's2') {
        buildingGroups.s1a.visible = false;
        buildingGroups.s2.visible = true;
        buildingGroups.s3.visible = false;
        camera.position.set(siteWidth / 2 + 120, baseElev + 100, chainageToZ(260) + 120);
        controls.target.set(siteWidth / 2, sampleTerrainY(siteWidth / 2, chainageToZ(260)), chainageToZ(260));
    } else if (view === 's3') {
        buildingGroups.s1a.visible = false;
        buildingGroups.s2.visible = false;
        buildingGroups.s3.visible = true;
        camera.position.set(siteWidth / 2 + 150, baseElev + 100, chainageToZ(100) + 150);
        controls.target.set(siteWidth / 2, sampleTerrainY(siteWidth / 2, chainageToZ(100)), chainageToZ(100));
    }
    controls.update();
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// COMPASS UPDATE
// ============================================================
function updateCompass() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const angle = Math.atan2(dir.x, dir.z);
    const needle = document.getElementById('compassNeedle');
    if (needle) {
        needle.style.transform = `translate(-50%, -100%) rotate(${-angle * (180 / Math.PI)}deg)`;
    }
}

// ============================================================
// RENDER LOOP
// ============================================================
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateCompass();
    renderer.render(scene, camera);
}

// ============================================================
// START
// ============================================================
init().catch(err => {
    console.error('Init error:', err);
    document.querySelector('.loader-content p').textContent = 'Помилка: ' + err.message;
});
