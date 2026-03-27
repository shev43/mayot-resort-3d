import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================
// MAYOT RESORT — SITE BASE (terrain, polygon, roads, grid)
// Без будівель — чиста ділянка для накладання архітектури
// ============================================================

const COLORS = {
    s1a: 0x2B5C3F, s2: 0xC4A882, s3: 0x9B8E7E,
    water: 0x4A90D9, amenity: 0xE8DFD5, service: 0x555555,
    road: 0x444444, glass: 0x88BBDD, wood: 0xA08060,
    stone: 0x8B7D6B, terrain: 0x4A6741, contour: 0xFFFFFF,
    guestBelt: 0x3A6B3A, deck: 0x8B6914,
};

const PALETTE = {
    white: 0xFAF8F5, sand: 0xE8DFD5, oak: 0xC4A882,
    stone: 0x9B8E7E, green: 0x2B5C3F, black: 0x2C2C2C,
};

let scene, camera, renderer, controls;
let terrainMesh, contourGroup, labelGroup, treeGroup, zoneGroup;
let buildingGroups = {};
let elevData = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let clickableObjects = [];
let tooltip;

let siteOrigin = { lat: 0, lon: 0 };
let mPerDegLat, mPerDegLon;
let siteWidth, siteHeight;

// ============================================================
// INIT
// ============================================================
async function init() {
    updateProgress(10);

    const resp = await fetch('js/data/elevation.json');
    elevData = await resp.json();
    updateProgress(30);

    mPerDegLat = elevData.m_per_deg_lat;
    mPerDegLon = elevData.m_per_deg_lon;
    siteWidth = elevData.site_dims.width_m;   // 185.68 м
    siteHeight = elevData.site_dims.height_m; // 421.33 м
    siteOrigin.lat = elevData.bounds.site_min_lat;
    siteOrigin.lon = elevData.bounds.site_min_lon;

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

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(siteWidth / 2, 40, -siteHeight / 2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 50;
    controls.maxDistance = 1200;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xFFF4E0, 1.2);
    dirLight.position.set(100, 250, 200);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(4096, 4096);
    dirLight.shadow.camera.left = -400;
    dirLight.shadow.camera.right = 400;
    dirLight.shadow.camera.top = 400;
    dirLight.shadow.camera.bottom = -400;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 1000;
    scene.add(dirLight);
    scene.add(new THREE.HemisphereLight(0x88BBFF, 0x446622, 0.3));
    updateProgress(40);

    buildTerrain();
    updateProgress(55);

    contourGroup = buildContours();
    scene.add(contourGroup);
    updateProgress(60);

    zoneGroup = buildZones();
    scene.add(zoneGroup);

    // ── ARCHITECTURE PLACEHOLDER ──
    // Тут додавати свої будівлі:
    // buildingGroups.myBuilding = buildMyBuilding();
    // scene.add(buildingGroups.myBuilding);

    // Dimension grid
    buildingGroups.dimGrid = buildDimensionGrid();
    scene.add(buildingGroups.dimGrid);

    // Entry gates
    buildEntryGates();
    updateProgress(80);

    treeGroup = buildTrees();
    scene.add(treeGroup);
    updateProgress(90);

    labelGroup = buildLabels();
    scene.add(labelGroup);

    tooltip = document.createElement('div');
    tooltip.id = 'tooltip';
    document.body.appendChild(tooltip);

    setupEvents();
    updateProgress(100);

    setTimeout(() => {
        document.getElementById('loading').classList.add('fade-out');
        setTimeout(() => document.getElementById('loading').style.display = 'none', 600);
    }, 500);

    window.__scene = scene;
    window.__clickable = clickableObjects;
    window.__THREE = THREE;

    animate();
}

function updateProgress(pct) {
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = pct + '%';
}

// ============================================================
// COORDINATE SYSTEM
// Chainage: ch.0 = south (z=0), ch.400 = north (z=-421m)
// Width: x=0 west, x=186 east
// Y = elevation - 855 (terrain base offset)
// ============================================================
function chainageToZ(ch) {
    return -(ch / 400) * siteHeight;
}

function widthToX(w) {
    return w;
}

function getElevationAt(x, z) {
    if (!elevData || !elevData.elevations) return 920;
    const grid = elevData.grid;
    const bounds = elevData.bounds;

    const localLat = siteOrigin.lat + ((-z / siteHeight) * (bounds.site_max_lat - bounds.site_min_lat));
    const localLon = siteOrigin.lon + ((x / siteWidth) * (bounds.site_max_lon - bounds.site_min_lon));

    const gridX = ((localLon - bounds.min_lon) / (bounds.max_lon - bounds.min_lon)) * (grid.cols - 1);
    const gridY = ((localLat - bounds.min_lat) / (bounds.max_lat - bounds.min_lat)) * (grid.rows - 1);

    const gx = Math.max(0, Math.min(grid.cols - 2, Math.floor(gridX)));
    const gy = Math.max(0, Math.min(grid.rows - 2, Math.floor(gridY)));
    const fx = gridX - gx;
    const fy = gridY - gy;

    const e = elevData.elevations;
    const v00 = e[gy][gx], v10 = e[gy][gx + 1];
    const v01 = e[gy + 1][gx], v11 = e[gy + 1][gx + 1];
    return (v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy);
}

function sampleTerrainY(x, z) {
    return getElevationAt(x, z) - 855;
}

// ============================================================
// SITE POLYGON (from KMZ)
// ============================================================
let sitePolyLocal = [];

function initSitePoly() {
    const poly = elevData.polygon;
    const bounds = elevData.bounds;
    sitePolyLocal = poly.map(p => ({
        x: ((p[1] - bounds.site_min_lon) / (bounds.site_max_lon - bounds.site_min_lon)) * siteWidth,
        z: -((p[0] - bounds.site_min_lat) / (bounds.site_max_lat - bounds.site_min_lat)) * siteHeight
    }));
}

function getSiteBounds(ch) {
    if (sitePolyLocal.length === 0) initSitePoly();
    const targetZ = chainageToZ(ch);
    const intersections = [];
    for (let i = 0; i < sitePolyLocal.length - 1; i++) {
        const a = sitePolyLocal[i], b = sitePolyLocal[i + 1];
        if ((a.z <= targetZ && b.z >= targetZ) || (a.z >= targetZ && b.z <= targetZ)) {
            if (Math.abs(b.z - a.z) < 0.01) continue;
            const t = (targetZ - a.z) / (b.z - a.z);
            intersections.push(a.x + t * (b.x - a.x));
        }
    }
    if (intersections.length < 2) return { xMin: 0, xMax: siteWidth };
    return { xMin: Math.min(...intersections), xMax: Math.max(...intersections) };
}

function clampBuilding(x, width, ch, margin) {
    margin = margin || 3;
    const bounds = getSiteBounds(ch);
    let cx = x;
    if (cx < bounds.xMin + margin) cx = bounds.xMin + margin;
    if (cx + width > bounds.xMax - margin) cx = bounds.xMax - margin - width;
    return cx;
}

// ============================================================
// TERRAIN
// ============================================================
function buildTerrain() {
    const gridW = 80, gridH = 160;
    const geo = new THREE.PlaneGeometry(siteWidth + 200, siteHeight + 200, gridW, gridH);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + siteWidth / 2;
        const z = pos.getZ(i) - siteHeight / 2;
        const y = sampleTerrainY(x, z);
        pos.setX(i, x);
        pos.setZ(i, z);
        pos.setY(i, y);
    }
    geo.computeVertexNormals();

    // Color by elevation
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = Math.max(0, Math.min(1, (y - 60) / 80));
        const r = 0.18 + t * 0.15;
        const g = 0.30 + t * 0.12;
        const b = 0.15 + t * 0.05;
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
    });
    terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // Site polygon outline
    if (sitePolyLocal.length === 0) initSitePoly();
    const polyPts = sitePolyLocal.map(p => {
        const y = sampleTerrainY(p.x, p.z) + 0.5;
        return new THREE.Vector3(p.x, y, p.z);
    });
    const polyGeo = new THREE.BufferGeometry().setFromPoints(polyPts);
    const polyLine = new THREE.Line(polyGeo, new THREE.LineBasicMaterial({ color: 0xffcc00, linewidth: 2 }));
    scene.add(polyLine);
}

// ============================================================
// CONTOUR LINES (10m interval)
// ============================================================
function buildContours() {
    const group = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: COLORS.contour, transparent: true, opacity: 0.2 });
    const matMajor = new THREE.LineBasicMaterial({ color: COLORS.contour, transparent: true, opacity: 0.4 });

    for (let elev = 920; elev <= 1000; elev += 10) {
        const y = elev - 855;
        const isMajor = elev % 50 === 0;
        const points = [];

        for (let xi = -20; xi <= siteWidth + 20; xi += 4) {
            for (let zi = 0; zi > -(siteHeight + 20); zi -= 4) {
                const terrY = sampleTerrainY(xi, zi);
                if (Math.abs(terrY - y) < 1.5) {
                    points.push(new THREE.Vector3(xi, y + 0.3, zi));
                }
            }
        }

        if (points.length > 0) {
            points.sort((a, b) => a.z - b.z || a.x - b.x);
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            group.add(new THREE.Points(geo, new THREE.PointsMaterial({
                color: COLORS.contour, size: isMajor ? 1.5 : 0.8,
                transparent: true, opacity: isMajor ? 0.35 : 0.15
            })));
        }

        if (isMajor) {
            const labelX = siteWidth + 5;
            const labelZ = 0;
            let found = false;
            for (let zi = 0; zi > -siteHeight; zi -= 5) {
                const ty = sampleTerrainY(siteWidth * 0.3, zi);
                if (Math.abs(ty - y) < 2) {
                    const lbl = makeTextSprite(`${elev}м`, { fontSize: 11, color: '#aaa', bgColor: 'rgba(0,0,0,0.5)' });
                    lbl.position.set(siteWidth * 0.3, y + 2, zi);
                    lbl.scale.set(12, 3, 1);
                    group.add(lbl);
                    found = true;
                    break;
                }
            }
        }
    }
    return group;
}

// ============================================================
// TEXT SPRITE HELPER
// ============================================================
function makeTextSprite(text, opts = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = opts.fontSize || 14;
    canvas.width = 512;
    canvas.height = 128;
    if (opts.bgColor) {
        ctx.fillStyle = opts.bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.font = `bold ${fontSize * 3}px Arial`;
    ctx.fillStyle = opts.color || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    return new THREE.Sprite(mat);
}

// ============================================================
// ZONES + ROAD NETWORK
// ============================================================
function buildZones() {
    const group = new THREE.Group();
    const leftW = 16, rightW = 24;

    [
        { x: 0, w: leftW, color: 0x666666, opacity: 0.15 },
        { x: siteWidth - rightW, w: rightW, color: 0x2B5C3F, opacity: 0.15 },
    ].forEach(z => {
        const planeGeo = new THREE.PlaneGeometry(z.w, siteHeight);
        planeGeo.rotateX(-Math.PI / 2);
        const plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
            color: z.color, transparent: true, opacity: z.opacity, side: THREE.DoubleSide
        }));
        plane.position.set(z.x + z.w / 2, 80 + 0.2, -siteHeight / 2);
        group.add(plane);
    });

    return group;
}

// ============================================================
// DIMENSION GRID
// ============================================================
function buildDimensionGrid() {
    const group = new THREE.Group();
    group.name = 'dimensionGrid';
    const majorStep = 50, minorStep = 25;
    const majorMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.35 });
    const minorMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.15 });

    function gridLine(x1, z1, x2, z2, mat) {
        const pts = [
            new THREE.Vector3(x1, sampleTerrainY(x1, z1) + 0.5, z1),
            new THREE.Vector3(x2, sampleTerrainY(x2, z2) + 0.5, z2)
        ];
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }

    // X grid lines
    for (let x = 0; x <= siteWidth; x += minorStep) {
        gridLine(x, 0, x, -siteHeight, x % majorStep === 0 ? majorMat : minorMat);
        if (x % majorStep === 0) {
            const lbl = makeTextSprite(`${Math.round(x)}м`, { fontSize: 13, color: '#ffaa00', bgColor: 'rgba(0,0,0,0.6)' });
            lbl.position.set(x, sampleTerrainY(x, 5) + 3, 5);
            lbl.scale.set(12, 4, 1);
            group.add(lbl);
        }
    }

    // Z grid lines
    for (let ch = 0; ch <= 400; ch += (400 / siteHeight * minorStep)) {
        const chRound = Math.round(ch / 25) * 25;
        if (chRound > 400) break;
        const z = chainageToZ(chRound);
        const realM = Math.round(chRound / 400 * siteHeight);
        const isMajor = realM % majorStep < 5 || (majorStep - (realM % majorStep)) < 5;
        gridLine(0, z, siteWidth, z, isMajor ? majorMat : minorMat);
        if (isMajor && realM > 0 && realM < siteHeight) {
            const lbl = makeTextSprite(`${realM}м`, { fontSize: 13, color: '#ffaa00', bgColor: 'rgba(0,0,0,0.6)' });
            lbl.position.set(-8, sampleTerrainY(2, z) + 3, z);
            lbl.scale.set(12, 4, 1);
            group.add(lbl);
        }
    }

    // Total dimension labels
    const wLabel = makeTextSprite(`↔ ${Math.round(siteWidth)}м`, { fontSize: 15, color: '#ff8800', bgColor: 'rgba(0,0,0,0.7)' });
    wLabel.position.set(siteWidth / 2, sampleTerrainY(siteWidth / 2, 5) + 8, 8);
    wLabel.scale.set(18, 5, 1);
    group.add(wLabel);

    const hLabel = makeTextSprite(`↕ ${Math.round(siteHeight)}м`, { fontSize: 15, color: '#ff8800', bgColor: 'rgba(0,0,0,0.7)' });
    hLabel.position.set(-15, sampleTerrainY(2, -siteHeight / 2) + 8, -siteHeight / 2);
    hLabel.scale.set(18, 5, 1);
    group.add(hLabel);

    // Area label
    const areaLabel = makeTextSprite('S = 5.36 га (53,561 м²)', { fontSize: 16, color: '#ff8800', bgColor: 'rgba(0,0,0,0.8)' });
    areaLabel.position.set(siteWidth / 2, sampleTerrainY(siteWidth / 2, -siteHeight * 0.15) + 15, -siteHeight * 0.15);
    areaLabel.scale.set(30, 6, 1);
    group.add(areaLabel);

    return group;
}

// ============================================================
// ENTRY GATES (ch.200)
// ============================================================
function buildEntryGates() {
    const ch = 200, z = chainageToZ(ch);

    const guestGate = new THREE.Mesh(
        new THREE.BoxGeometry(8, 4, 3),
        new THREE.MeshStandardMaterial({ color: PALETTE.stone, roughness: 0.8 })
    );
    guestGate.position.set(4, sampleTerrainY(4, z) + 2, z);
    guestGate.userData = { name: 'Guest Gate', stage: 'infra', clickable: true, info: { type: 'Guest Gate', location: 'ch.200' } };
    clickableObjects.push(guestGate);
    scene.add(guestGate);

    const serviceGate = new THREE.Mesh(
        new THREE.BoxGeometry(6, 3, 3),
        new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 })
    );
    serviceGate.position.set(4, sampleTerrainY(4, z + 12) + 1.5, z + 12);
    serviceGate.userData = { name: 'Service Gate', stage: 'infra', clickable: true, info: { type: 'Service Gate', location: 'ch.200' } };
    clickableObjects.push(serviceGate);
    scene.add(serviceGate);

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

    function addTree(x, z, scale = 1) {
        const y = sampleTerrainY(x, z);
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3 * scale, 0.5 * scale, 3 * scale, 6),
            new THREE.MeshStandardMaterial({ color: 0x5C3A1E })
        );
        trunk.position.set(x, y + 1.5 * scale, z);
        trunk.castShadow = true;
        group.add(trunk);

        const crown = new THREE.Mesh(
            new THREE.ConeGeometry(2.5 * scale, 8 * scale, 6),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.28 + Math.random() * 0.06, 0.5, 0.2 + Math.random() * 0.1),
                roughness: 0.9
            })
        );
        crown.position.set(x, y + 6 * scale, z);
        crown.castShadow = true;
        group.add(crown);
    }

    for (let ch = 5; ch <= 395; ch += 12) {
        for (let i = 0; i < 3; i++) {
            addTree(siteWidth - 20 + Math.random() * 16, chainageToZ(ch + Math.random() * 10), 0.7 + Math.random() * 0.5);
        }
    }
    for (let ch = 5; ch <= 395; ch += 15) {
        for (let i = 0; i < 2; i++) {
            addTree(siteWidth + 10 + Math.random() * 40, chainageToZ(ch + Math.random() * 12), 0.8 + Math.random() * 0.6);
        }
    }
    for (let i = 0; i < 200; i++) {
        const x = -30 + Math.random() * (siteWidth + 100);
        const z = chainageToZ(Math.random() * 450 - 25);
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
    for (let ch = 0; ch <= 400; ch += 50) {
        const z = chainageToZ(ch);
        const lbl = makeTextSprite(`ch.${ch}`, { fontSize: 12, color: '#888', bgColor: 'rgba(0,0,0,0.6)' });
        lbl.position.set(-5, sampleTerrainY(0, z) + 3, z);
        lbl.scale.set(16, 4, 1);
        group.add(lbl);
    }

    const midZ = chainageToZ(200);
    const midY = sampleTerrainY(siteWidth / 2, midZ) + 35;

    const leftLabel = makeTextSprite('LEFT (Service)', { fontSize: 12, color: '#888' });
    leftLabel.position.set(8, midY, midZ); leftLabel.scale.set(20, 5, 1); group.add(leftLabel);

    const centerLabel = makeTextSprite('CENTER (Build Zone)', { fontSize: 12, color: '#aaa' });
    centerLabel.position.set(siteWidth / 2, midY, midZ); centerLabel.scale.set(28, 7, 1); group.add(centerLabel);

    const rightLabel = makeTextSprite('RIGHT (Guest Belt)', { fontSize: 12, color: '#2B5C3F' });
    rightLabel.position.set(siteWidth - 12, midY, midZ); rightLabel.scale.set(24, 6, 1); group.add(rightLabel);

    const northLabel = makeTextSprite('N ↑', { fontSize: 20, color: '#cc4444', bgColor: 'rgba(0,0,0,0.7)' });
    northLabel.position.set(siteWidth / 2, midY + 20, chainageToZ(400) + 20);
    northLabel.scale.set(12, 6, 1); group.add(northLabel);

    return group;
}

// ============================================================
// EVENTS & UI
// ============================================================
function setupEvents() {
    renderer.domElement.addEventListener('click', onMouseClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);

    document.getElementById('toggleContours')?.addEventListener('change', e => { contourGroup.visible = e.target.checked; });
    document.getElementById('toggleLabels')?.addEventListener('change', e => { labelGroup.visible = e.target.checked; });
    document.getElementById('toggleTrees')?.addEventListener('change', e => { treeGroup.visible = e.target.checked; });
    document.getElementById('toggleZones')?.addEventListener('change', e => { zoneGroup.visible = e.target.checked; });
    document.getElementById('toggleDimGrid')?.addEventListener('change', e => { if (buildingGroups.dimGrid) buildingGroups.dimGrid.visible = e.target.checked; });
    document.getElementById('closeInfo')?.addEventListener('click', () => { document.getElementById('info-panel').classList.add('hidden'); });
}

function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects, true);
    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData?.clickable) obj = obj.parent;
        if (obj?.userData?.info) showInfoPanel(obj.userData);
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
        if (obj?.userData?.name) {
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
    content.innerHTML = html;
    panel.classList.remove('hidden');
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// COMPASS
// ============================================================
function updateCompass() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const angle = Math.atan2(dir.x, dir.z);
    const needle = document.getElementById('compassNeedle');
    if (needle) needle.style.transform = `translate(-50%, -100%) rotate(${-angle * (180 / Math.PI)}deg)`;
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
// EXPORTED API — для використання з зовнішньої архітектури
// ============================================================
export {
    scene, camera, controls, clickableObjects, buildingGroups,
    siteWidth, siteHeight,
    chainageToZ, widthToX,
    sampleTerrainY, getElevationAt,
    getSiteBounds, clampBuilding,
    makeTextSprite,
    COLORS, PALETTE,
};

// ============================================================
// START
// ============================================================
init().catch(err => {
    console.error('Init error:', err);
    document.querySelector('.loader-content p').textContent = 'Помилка: ' + err.message;
});
