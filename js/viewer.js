import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
// Expose for debugging
window.__camera = null;
window.__controls = null;
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
// ADLER LODGE ALPE — v2 based on Google Earth aerial
// L-shaped main building + 12 organic chalets + rooftop pool
// ============================================================
function buildAdlerLodge() {
    const cx = widthToX(93);
    const cz = chainageToZ(210);
    const baseY = sampleTerrainY(cx, cz);

    const group = new THREE.Group();
    group.name = 'ADLER_Lodge';
    group.position.set(cx, baseY, cz);

    const matWood = new THREE.MeshStandardMaterial({ color: 0xA0764A, roughness: 0.8 });
    const matWoodDark = new THREE.MeshStandardMaterial({ color: 0x6B4830, roughness: 0.85 });
    const matGlass = new THREE.MeshStandardMaterial({ color: 0x7AB8CC, metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x5A5A5A, roughness: 0.7, metalness: 0.3 });
    const matStone = new THREE.MeshStandardMaterial({ color: 0x8B8178, roughness: 0.95 });
    const matPool = new THREE.MeshStandardMaterial({ color: 0x2A90B5, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.75 });
    const matDeck = new THREE.MeshStandardMaterial({ color: 0x9B8B6B, roughness: 0.8 });
    const matPath = new THREE.MeshStandardMaterial({ color: 0xD4C8A0, roughness: 0.9 });

    // ---- MAIN LODGE — L-shape (3 wings) ----
    // From aerial: Central wing (reception+restaurant), Left wing (suites), Right wing (SPA+pool)
    // Total footprint ~80×55m

    // Alpine Chalet style materials
    const matPlaster = new THREE.MeshStandardMaterial({ color: 0xF0E8D8, roughness: 0.9 }); // cream plaster
    const matTimber = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.75 }); // dark timber beams
    const matShutters = new THREE.MeshStandardMaterial({ color: 0x8B0000, roughness: 0.8 }); // dark red shutters

    function addWing(wx, wz, wW, wD, wH, rot, name) {
        const wingG = new THREE.Group();
        wingG.position.set(wx, 0, wz);
        wingG.rotation.y = rot;

        // --- MASSIVE STONE BASE (Alpine foundation, 2m) ---
        const stoneH = 2.0;
        const b = new THREE.Mesh(new THREE.BoxGeometry(wW + 2, stoneH, wD + 2), matStone);
        b.position.y = stoneH / 2;
        b.castShadow = true;
        wingG.add(b);

        // --- GROUND FLOOR — cream plaster with timber frame ---
        const gfH = 3.2;
        const gf = new THREE.Mesh(new THREE.BoxGeometry(wW, gfH, wD), matPlaster);
        gf.position.y = stoneH + gfH / 2;
        gf.castShadow = true;
        wingG.add(gf);

        // Timber beams on ground floor (horizontal stripes)
        for (let bh = 0; bh < 2; bh++) {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(wW + 0.3, 0.2, 0.15), matTimber);
            beam.position.set(0, stoneH + 1 + bh * 1.8, -wD / 2 - 0.08);
            wingG.add(beam);
            const beamB = beam.clone();
            beamB.position.z = wD / 2 + 0.08;
            wingG.add(beamB);
        }
        // Vertical timber posts
        for (let ti = 0; ti <= 4; ti++) {
            const px = -wW / 2 + ti * (wW / 4);
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, gfH, 0.15), matTimber);
            post.position.set(px, stoneH + gfH / 2, -wD / 2 - 0.08);
            wingG.add(post);
        }

        // --- FIRST FLOOR — warm wood (Stube) ---
        const ffH = 3.2;
        const ffBase = stoneH + gfH;
        const ff = new THREE.Mesh(new THREE.BoxGeometry(wW, ffH, wD), matWood);
        ff.position.y = ffBase + ffH / 2;
        ff.castShadow = true;
        wingG.add(ff);

        // --- STEEP PITCHED ROOF (Alpine style, 35°+ slope, big overhang) ---
        const roofH = wD * 0.45; // steep pitch
        const overhang = 2.5; // big overhang (Alpine signature)
        const rBase = ffBase + ffH;
        const hw = wW / 2 + overhang;
        const hd = wD / 2 + overhang;

        const rv = new Float32Array([
            // Front face
            -hw, rBase, -hd,  hw, rBase, -hd,  0, rBase + roofH, -hd * 0.15,
            // Right face
            hw, rBase, -hd,  hw, rBase, hd,  0, rBase + roofH, hd * 0.15,
            // Ridge connection front-right
            0, rBase + roofH, -hd * 0.15,  hw, rBase, -hd,  0, rBase + roofH, hd * 0.15,
            // Back face
            -hw, rBase, hd,  hw, rBase, hd,  0, rBase + roofH, hd * 0.15,
            // Left face
            -hw, rBase, -hd,  -hw, rBase, hd,  0, rBase + roofH, -hd * 0.15,
            // Ridge connection back-left
            -hw, rBase, hd,  0, rBase + roofH, hd * 0.15,  0, rBase + roofH, -hd * 0.15,
        ]);
        const rg = new THREE.BufferGeometry();
        rg.setAttribute('position', new THREE.BufferAttribute(rv, 3));
        rg.computeVertexNormals();
        const rm = new THREE.Mesh(rg, matRoof);
        rm.castShadow = true;
        wingG.add(rm);

        // --- GLASS PANELS — tall alpine windows with shutters ---
        const nPanels = Math.floor(wW / 4);
        for (let i = 0; i < nPanels; i++) {
            const px = -wW / 2 + 2 + i * (wW - 4) / nPanels;

            // Ground floor — arched stone windows (smaller)
            const gWin = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.2), matGlass);
            gWin.position.set(px, stoneH + gfH / 2 + 0.3, -wD / 2 - 0.01);
            wingG.add(gWin);

            // First floor — large panoramic windows
            const fWin = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.6), matGlass);
            fWin.position.set(px, ffBase + ffH / 2 + 0.2, -wD / 2 - 0.01);
            wingG.add(fWin);

            // Shutters (dark red, flanking first floor windows)
            for (let side = -1; side <= 1; side += 2) {
                const sh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.08), matShutters);
                sh.position.set(px + side * 1.6, ffBase + ffH / 2 + 0.2, -wD / 2 - 0.05);
                wingG.add(sh);
            }

            // Back windows (smaller)
            const bWin = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.0), matGlass);
            bWin.position.set(px, ffBase + ffH / 2, wD / 2 + 0.01);
            bWin.rotation.y = Math.PI;
            wingG.add(bWin);
        }

        // --- WIDE WOODEN BALCONIES (both floors, front) ---
        // Ground floor covered terrace
        const bal1 = new THREE.Mesh(new THREE.BoxGeometry(wW - 1, 0.15, 2.5), matDeck);
        bal1.position.set(0, stoneH, -wD / 2 - 1.25);
        wingG.add(bal1);

        // First floor balcony (wider, Alpine signature)
        const bal2 = new THREE.Mesh(new THREE.BoxGeometry(wW + 1, 0.15, 3.0), matDeck);
        bal2.position.set(0, ffBase, -wD / 2 - 1.5);
        wingG.add(bal2);

        // Carved wooden railing (decorative)
        const rail2 = new THREE.Mesh(new THREE.BoxGeometry(wW + 1, 1.0, 0.12), matWood);
        rail2.position.set(0, ffBase + 0.5, -wD / 2 - 3.0);
        wingG.add(rail2);

        // Balcony support brackets (wooden)
        const nBrackets = Math.floor(wW / 5);
        for (let bi = 0; bi < nBrackets; bi++) {
            const bx = -wW / 2 + 2.5 + bi * (wW / nBrackets);
            const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 2.0), matTimber);
            bracket.position.set(bx, ffBase - 0.8, -wD / 2 - 1.5);
            bracket.rotation.x = 0.3;
            wingG.add(bracket);
        }

        // --- CHIMNEY (stone, Alpine must-have) ---
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3, 1.0), matStone);
        chimney.position.set(wW / 4, rBase + roofH * 0.6, 0);
        chimney.castShadow = true;
        wingG.add(chimney);

        group.add(wingG);
        return wingG;
    }

    // Central wing — reception + restaurant (40m roof edge, faces NW = -Z)
    addWing(0, 0, 40, 16, 8, 0, 'Central');
    // Left wing — suites (angled, shorter)
    addWing(-24, -16, 26, 14, 8, 0.35, 'Suites West');
    // Right wing — SPA + pool wing (angled)
    addWing(22, -12, 24, 14, 8, -0.25, 'SPA East');

    // ---- ROOFTOP POOL ---- (between wings, turquoise from aerial)
    const pool = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 6), matPool);
    pool.position.set(4, 8, -5);
    group.add(pool);
    const pDeck = new THREE.Mesh(new THREE.BoxGeometry(18, 0.1, 10), matDeck);
    pDeck.position.set(4, 7.5, -5);
    group.add(pDeck);

    // ---- 12 CHALETS ---- organic layout (from aerial photo)
    // Upper group (north, closer to ski slope) — 7 chalets
    // Lower group (east/west flanks) — 5 chalets
    // Each rotated individually, connected by paths
    const chaletPositions = [
        // Upper arc (north side, facing south toward lodge) — 7 chalets
        { x:-35, z:-35, rot: 0.4 },
        { x:-22, z:-42, rot: 0.2 },
        { x:-8,  z:-44, rot: 0.0 },
        { x: 8,  z:-42, rot:-0.15 },
        { x: 22, z:-38, rot:-0.3 },
        { x: 32, z:-30, rot:-0.5 },
        { x: 38, z:-20, rot:-0.6 },
        // Lower flanks — 5 chalets
        { x:-40, z:-14, rot: 0.6 },
        { x:-44, z: 2,  rot: 0.7 },
        { x: 40, z:-6,  rot:-0.5 },
        { x: 42, z: 10, rot:-0.4 },
        { x: 36, z: 22, rot:-0.3 },
    ];

    for (let ci = 0; ci < chaletPositions.length; ci++) {
        const chX = chaletPositions[ci].x, chZ = chaletPositions[ci].z;
        const chRot = chaletPositions[ci].rot;
        const chY = sampleTerrainY(cx + chX, cz + chZ) - baseY;
        const chaletGroup = new THREE.Group();
        chaletGroup.position.set(chX, chY, chZ);
        chaletGroup.rotation.y = chRot;

        const cW = 8, cD = 7, cH = 6;

        // Stone foundation
        const cBase = new THREE.Mesh(new THREE.BoxGeometry(cW + 0.5, 0.8, cD + 0.5), matStone);
        cBase.position.y = 0.4;
        chaletGroup.add(cBase);

        // Ground floor (dark wood)
        const cGF = new THREE.Mesh(new THREE.BoxGeometry(cW, 2.8, cD), matWoodDark);
        cGF.position.y = 0.8 + 1.4;
        cGF.castShadow = true;
        chaletGroup.add(cGF);

        // First floor (light wood)
        const cFF = new THREE.Mesh(new THREE.BoxGeometry(cW, 2.8, cD), matWood);
        cFF.position.y = 0.8 + 2.8 + 1.4;
        cFF.castShadow = true;
        chaletGroup.add(cFF);

        // Pitched roof (2 planes)
        const roofH = 1.8;
        const roofGeo = new THREE.BufferGeometry();
        const hw = cW/2 + 0.5, hd = cD/2 + 0.5;
        const roofBase = 0.8 + 5.6;
        const verts = new Float32Array([
            -hw, roofBase, -hd,  hw, roofBase, -hd,  0, roofBase + roofH, -hd,
            hw, roofBase, -hd,   hw, roofBase, hd,   0, roofBase + roofH, hd,
            0, roofBase + roofH, -hd, hw, roofBase, -hd, 0, roofBase + roofH, hd,
            -hw, roofBase, hd,   -hw, roofBase, -hd,  0, roofBase + roofH, -hd,
            -hw, roofBase, hd,   0, roofBase + roofH, -hd, 0, roofBase + roofH, hd,
            hw, roofBase, hd,    -hw, roofBase, hd,   0, roofBase + roofH, hd,
        ]);
        roofGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        roofGeo.computeVertexNormals();
        const cRoof = new THREE.Mesh(roofGeo, matRoof);
        cRoof.castShadow = true;
        chaletGroup.add(cRoof);

        // Glass front
        const cGlass = new THREE.Mesh(new THREE.PlaneGeometry(cW - 1, 4.5), matGlass);
        cGlass.position.set(0, 0.8 + 3, -cD/2 - 0.01);
        chaletGroup.add(cGlass);

        // Terrace / deck
        const cDeck = new THREE.Mesh(new THREE.BoxGeometry(cW + 2, 0.15, 3), matDeck);
        cDeck.position.set(0, 0.8, -cD/2 - 1.5);
        chaletGroup.add(cDeck);

        // Label
        const cLabel = makeTextSprite('Chalet ' + (ci + 1) + '\n75м²', { fontSize: 10, color: '#D4A574', bgColor: 'rgba(0,0,0,0.5)' });
        cLabel.position.y = 10;
        chaletGroup.add(cLabel);

        chaletGroup.userData = {
            name: 'ADLER Chalet #' + (ci + 1),
            type: 'adler-chalet',
            info: 'Дерев\'яне шале 75м² · 2 поверхи\nМодрина + смерека\nКамін · Фінська сауна · Балкон\nВид на Карпати'
        };

        group.add(chaletGroup);
    }

    // ---- PATHS connecting chalets to lodge (white gravel like in aerial) ----
    const pathPts = [
        // Main path from lodge to upper chalets
        [[0, -10], [-5, -22], [-12, -32], [-22, -42]],
        [[0, -10], [5, -22], [12, -32], [22, -38]],
        // Side paths to flanks
        [[-12, -32], [-35, -35]],
        [[12, -32], [32, -30], [38, -20]],
        [[-22, -42], [-35, -35], [-40, -14], [-44, 2]],
        [[22, -38], [32, -30], [40, -6], [42, 10], [36, 22]],
        // Path to entrance (south)
        [[0, 16], [0, 30], [5, 45]],
    ];

    for (const path of pathPts) {
        const pts3d = path.map(([px, pz]) => {
            const py = sampleTerrainY(cx + px, cz + pz) - baseY + 0.15;
            return new THREE.Vector3(px, py, pz);
        });
        if (pts3d.length >= 2) {
            const curve = new THREE.CatmullRomCurve3(pts3d, false, 'centripetal', 0.5);
            const smooth = curve.getPoints(pts3d.length * 8);
            // Path as thin flat ribbon
            const pathVerts = [];
            const pathIdx = [];
            const pathW = 1.2;
            for (let i = 0; i < smooth.length; i++) {
                const p = smooth[i];
                let nx = 0, nz = 1;
                if (i < smooth.length - 1) {
                    const dx = smooth[i+1].x - p.x, dz = smooth[i+1].z - p.z;
                    const l = Math.sqrt(dx*dx + dz*dz) || 1;
                    nx = -dz/l; nz = dx/l;
                }
                pathVerts.push(p.x + nx*pathW/2, p.y, p.z + nz*pathW/2);
                pathVerts.push(p.x - nx*pathW/2, p.y, p.z - nz*pathW/2);
            }
            for (let i = 0; i < smooth.length - 1; i++) {
                const a = i*2, b = i*2+1, c = (i+1)*2, d = (i+1)*2+1;
                pathIdx.push(a,b,c, b,d,c);
            }
            const pg = new THREE.BufferGeometry();
            pg.setAttribute('position', new THREE.Float32BufferAttribute(pathVerts, 3));
            pg.setIndex(pathIdx);
            pg.computeVertexNormals();
            const pm = new THREE.Mesh(pg, matPath);
            group.add(pm);
        }
    }

    // ---- LABEL & INFO ----
    const label = makeTextSprite('ADLER Lodge ALPE\n30 rooms · 1800m style', { fontSize: 16, color: '#D4A574', bgColor: 'rgba(30,20,10,0.8)' });
    label.position.y = 14;
    label.userData = {
        name: 'ADLER Lodge ALPE — Alpine Wooden Lodge',
        type: 'adler-lodge',
        info:
`🏔️ ADLER Lodge ALPE — Натхнення
═══════════════════════════════
📍 Оригінал: Alpe di Siusi, 1800м, Доломіти
🏗️ Архітектори: Hugo & Hanspeter Demetz
🪵 Матеріали: модрина, смерека, камінь
═══════════════════════════════
ГОЛОВНА БУДІВЛЯ (60×20м):
• 18 Junior Suites (45-60м²)
• Ресторан зі скляними стінами
• SPA + Wellness зона
• Infinity pool з підігрівом
═══════════════════════════════
12 ОКРЕМИХ ШАЛЕ (75м² кожне):
• 2 поверхи: вітальня + спальня
• Камін · Фінська сауна · Балкон
• Повністю з дерева (модрина)
• Розкидані навколо лоджу
═══════════════════════════════
СТИЛЬ:
• Alpine + Safari luxury (Japandi)
• Скандинавські меблі + хутро
• Панорамні вікна floor-to-ceiling
• Тепле дерево + камінь + 2700K
• A-class climate house (еко)
═══════════════════════════════
ВСЬОГО: 30 номерів
• 18 suites × 45-60м² = ~990м²
• 12 chalets × 75м² = 900м²
• SPA + Pool + Restaurant
• Total GBA: ~2,500м²`
    };
    clickableObjects.push(label);
    group.add(label);

    group.rotation.y = -0.15;  // slight NW-SE alignment with terrain
    scene.add(group);
    console.log('ADLER Lodge ALPE placed at center of site');
}

// ============================================================
// AKI FAMILY RESORT PLOSE — Cubist timber, 70 suites, below ADLER
// ============================================================
function buildAKIResort() {
    // Below ADLER (ch=210), place at ch=280 (further south/downhill)
    const cx = widthToX(93);
    const cz = chainageToZ(280);
    const baseY = sampleTerrainY(cx, cz);

    const group = new THREE.Group();
    group.name = 'AKI_Resort';
    group.position.set(cx, baseY, cz);

    const matTimberGrey = new THREE.MeshStandardMaterial({ color: 0x6B6B6B, roughness: 0.7 });
    const matTimberWarm = new THREE.MeshStandardMaterial({ color: 0x9B8060, roughness: 0.75 });
    const matGlassAki = new THREE.MeshStandardMaterial({ color: 0x8FBFCC, metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const matGreenRoof = new THREE.MeshStandardMaterial({ color: 0x5A7A4A, roughness: 0.9 });
    const matStoneAki = new THREE.MeshStandardMaterial({ color: 0x8A8278, roughness: 0.9 });
    const matPoolAki = new THREE.MeshStandardMaterial({ color: 0x2A90B5, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.7 });
    const matDeckAki = new THREE.MeshStandardMaterial({ color: 0x9B8B6B, roughness: 0.8 });
    const matKids = new THREE.MeshStandardMaterial({ color: 0xE8C840, roughness: 0.7 }); // playful yellow

    // --- MAIN BUILDING — stepped cubist volumes along slope ---
    // 3 interlocking blocks, each slightly offset and rotated (cubist style)

    function addCubistBlock(bx, bz, bW, bD, floors, rot) {
        const bg = new THREE.Group();
        bg.position.set(bx, 0, bz);
        bg.rotation.y = rot;
        const floorH = 3.2;
        const totalH = floors * floorH;

        // Stone base
        const base = new THREE.Mesh(new THREE.BoxGeometry(bW + 0.5, 1.2, bD + 0.5), matStoneAki);
        base.position.y = 0.6; base.castShadow = true; bg.add(base);

        // Floors — alternating grey timber and warm wood
        for (let f = 0; f < floors; f++) {
            const mat = f % 2 === 0 ? matTimberGrey : matTimberWarm;
            // Each upper floor slightly cantilevered (cubist offset)
            const offset = f * 0.3;
            const block = new THREE.Mesh(
                new THREE.BoxGeometry(bW + offset, floorH, bD),
                mat
            );
            block.position.set(offset * 0.5, 1.2 + f * floorH + floorH / 2, 0);
            block.castShadow = true;
            bg.add(block);

            // Glass panels on front
            const nWin = Math.floor(bW / 4);
            for (let w = 0; w < nWin; w++) {
                const wx = -bW / 2 + 2 + w * (bW - 3) / nWin + offset * 0.5;
                const win = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.6), matGlassAki);
                win.position.set(wx, 1.2 + f * floorH + floorH / 2 + 0.2, -bD / 2 - 0.01);
                bg.add(win);
            }

            // Balconies (every floor, front face)
            const bal = new THREE.Mesh(new THREE.BoxGeometry(bW - 1, 0.12, 1.8), matDeckAki);
            bal.position.set(offset * 0.5, 1.2 + f * floorH, -bD / 2 - 0.9);
            bg.add(bal);
        }

        // Green roof (flat, with vegetation)
        const gRoof = new THREE.Mesh(new THREE.BoxGeometry(bW + 2, 0.4, bD + 2), matGreenRoof);
        gRoof.position.y = 1.2 + totalH + 0.2;
        gRoof.castShadow = true;
        bg.add(gRoof);

        group.add(bg);
    }

    // Block A — main (40 Family Suites), 4 floors
    addCubistBlock(0, 0, 45, 16, 4, 0.05);
    // Block B — left wing (22 Superior), 3 floors, offset
    addCubistBlock(-30, 10, 30, 14, 3, 0.15);
    // Block C — right wing (8 Family Homes + SPA), 3 floors
    addCubistBlock(28, 8, 28, 14, 3, -0.1);

    // --- CONNECTING BRIDGE between blocks (glass corridor) ---
    const bridge1 = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 4), matGlassAki);
    bridge1.position.set(-14, 5, 5);
    bridge1.rotation.y = 0.1;
    group.add(bridge1);
    const bridge2 = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 4), matGlassAki);
    bridge2.position.set(14, 5, 4);
    bridge2.rotation.y = -0.05;
    group.add(bridge2);

    // --- KIDS ZONE (playful yellow accent building) ---
    const kids = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 12), matKids);
    kids.position.set(-15, 2.5, 22);
    kids.castShadow = true;
    group.add(kids);
    const kidsRoof = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 14), matGreenRoof);
    kidsRoof.position.set(-15, 5.15, 22);
    group.add(kidsRoof);

    // Kids label
    const kLbl = makeTextSprite('🧒 Kids Zone\nТеатр · Майстерня · Скалодром', { fontSize: 11, color: '#FFD700', bgColor: 'rgba(0,0,0,0.6)' });
    kLbl.position.set(-15, 8, 22);
    group.add(kLbl);

    // --- FAMILY SPA (connected to Block C) ---
    const spa = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 10), matTimberWarm);
    spa.position.set(38, 2, -6);
    spa.castShadow = true;
    group.add(spa);
    const spaGlass = new THREE.Mesh(new THREE.PlaneGeometry(18, 3.5), matGlassAki);
    spaGlass.position.set(38, 2, -11.01);
    group.add(spaGlass);
    const spaRoof = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 12), matGreenRoof);
    spaRoof.position.set(38, 4.15, -6);
    group.add(spaRoof);

    // Outdoor family pool
    const pool = new THREE.Mesh(new THREE.BoxGeometry(15, 1, 8), matPoolAki);
    pool.position.set(38, 0.5, -16);
    group.add(pool);
    const pDeck = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 12), matDeckAki);
    pDeck.position.set(38, 0.05, -16);
    group.add(pDeck);

    // --- PETTING ZOO area ---
    const zoo = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.3, 12), matGreenRoof);
    zoo.position.set(20, 0.15, 25);
    group.add(zoo);
    // Fence
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 4), matTimberGrey);
        post.position.set(20 + Math.cos(a) * 6, 0.6, 25 + Math.sin(a) * 6);
        group.add(post);
    }
    const zLbl = makeTextSprite('🐑 Petting Zoo', { fontSize: 10, color: '#AADDAA', bgColor: 'rgba(0,0,0,0.5)' });
    zLbl.position.set(20, 3, 25);
    group.add(zLbl);

    // --- LABEL & INFO ---
    const label = makeTextSprite('AKI Family Resort PLOSE\n70 suites · Kids · SPA', { fontSize: 16, color: '#88CCFF', bgColor: 'rgba(20,30,40,0.8)' });
    label.position.y = 18;
    label.userData = {
        name: 'AKI Family Resort PLOSE',
        type: 'aki-resort',
        info:
`🏔️ AKI Family Resort PLOSE
═══════════════════════════════
📍 Оригінал: Plose, Bressanone, Південний Тіроль
🏆 TIME World's Greatest Places 2025
🏗️ Стиль: Cubist timber, зелені дахи, без пластику
═══════════════════════════════
НОМЕРНИЙ ФОНД (70 suites):
• 40 Family Suite — 50м² (2-5 осіб)
• 22 Family Suite Superior — 55м² (2-5 осіб)
• 8 Family Homes — 70м² (4-7 осіб)
═══════════════════════════════
ДИТЯЧА ЗОНА:
• 12 годин професійного догляду/день
• Театр · Малярська студія · Майстерня
• Скалодром · Пригодницька траса
• Дитяча лижна зона + magic carpet
• Petting zoo · Duck pond
═══════════════════════════════
SPA:
• Family SPA (для всіх)
• ADLER SPA (18+ в лісі)
• Відкритий басейн
═══════════════════════════════
📐 3 блоки (cubist, зелені дахи)
🪵 Смерека + дуб + натуральний камінь
☀️ Фотоелектрична система
🌿 Клас A — кліматичний будинок`
    };
    clickableObjects.push(label);
    group.add(label);

    group.rotation.y = -0.1;
    scene.add(group);
    console.log('AKI Family Resort placed below ADLER');
}

// ============================================================
// SKI LIFT — Lower Station (920m) + Upper Station (1200m) + Cable
// ============================================================
function buildSkiLift() {
    const group = new THREE.Group();
    group.name = 'Ski_Lift';

    // Coordinates from KMZ files
    // Lower: 48.453°N 24.5002°E → w=129.8, ch=17
    // Upper: 48.4651°N 24.495459°E → w=-219.6, ch=1294 (beyond site)
    // Station on parking roof — 70% from north edge (ski runout zone = 70% of roof)
    // Parking: center (95,-50), 105×60m → N edge z=-80, S edge z=-20
    // 70% from N to S: z = -80 + 0.7*60 = -38
    // Lift axis at z=-38: x = 124
    const lowerX = 124;
    const lowerZ = -38;
    const lowerY = sampleTerrainY(95, -50) + 7.4; // parking roof level

    const upperX = -219.6;
    const upperZ = -1294;
    const upperY = sampleTerrainY(upperX, upperZ);

    // ============================================================
    // LOWER STATION (920m) — Doppelmayr D-Line
    // ============================================================
    // Based on reference image: rectangular white concrete box raised on
    // massive concrete pillars. Curved glass barrel-vault roof with steel
    // ribs. Gondolas pass UNDERNEATH through the building. Glass end-wall.
    const _pkRoofY = sampleTerrainY(95, -50) + 7.4;
    const lsGroup = new THREE.Group();
    lsGroup.position.set(lowerX, _pkRoofY, lowerZ);
    // Rotate to align with cable direction (-105.3° from +X)
    lsGroup.rotation.y = -(-1.8382); // rotate so long axis = cable direction

    // Materials
    const mWhite = new THREE.MeshStandardMaterial({ color: 0xE8E4E0, roughness: 0.5 });
    const mGlass = new THREE.MeshStandardMaterial({ color: 0x7BB8D0, metalness: 0.5, roughness: 0.08, transparent: true, opacity: 0.35 });
    const mGlassDark = new THREE.MeshStandardMaterial({ color: 0x5599BB, metalness: 0.5, roughness: 0.1, transparent: true, opacity: 0.5 });
    const mSteel = new THREE.MeshStandardMaterial({ color: 0x8A8A8A, metalness: 0.8, roughness: 0.2 });
    const mDark = new THREE.MeshStandardMaterial({ color: 0x3A3A3A, metalness: 0.85, roughness: 0.15 });

    const stL = 18, stW = 9, stH = 5.5; // 18m long, 9m wide, 5.5m tall
    const pillarH = 4.0; // pillar height

    // --- 4 concrete pillars ---
    for (let px = -1; px <= 1; px += 2) {
        for (let pz = -1; pz <= 1; pz += 2) {
            const pillar = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, pillarH, 1.5), mWhite);
            pillar.position.set(px * (stL/2 - 1.5), pillarH / 2, pz * (stW/2 - 1));
            pillar.castShadow = true;
            lsGroup.add(pillar);
        }
    }

    // --- Main box (raised on pillars) ---
    const boxY = pillarH + stH / 2;
    // Bottom slab
    const botSlab = new THREE.Mesh(new THREE.BoxGeometry(stL + 1, 0.5, stW + 1), mWhite);
    botSlab.position.set(0, pillarH + 0.25, 0);
    botSlab.castShadow = true;
    lsGroup.add(botSlab);

    // End walls (white concrete frame)
    const endL = new THREE.Mesh(new THREE.BoxGeometry(0.8, stH, stW), mWhite);
    endL.position.set(-stL/2 + 0.4, boxY, 0);
    lsGroup.add(endL);
    const endR = new THREE.Mesh(new THREE.BoxGeometry(0.8, stH, stW), mWhite);
    endR.position.set(stL/2 - 0.4, boxY, 0);
    lsGroup.add(endR);

    // Glass end wall (panoramic)
    const endGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, stH - 1, stW - 1.5), mGlass);
    endGlass.position.set(stL/2 - 0.05, boxY + 0.3, 0);
    lsGroup.add(endGlass);

    // Side walls — lower solid + upper glass
    for (let side = -1; side <= 1; side += 2) {
        const wallLower = new THREE.Mesh(new THREE.BoxGeometry(stL - 1, 1.2, 0.25), mWhite);
        wallLower.position.set(0, pillarH + 0.6 + 0.5, side * stW/2);
        lsGroup.add(wallLower);
        // Glass above
        const wallGlass = new THREE.Mesh(new THREE.BoxGeometry(stL - 1, stH - 1.5, 0.08), mGlass);
        wallGlass.position.set(0, pillarH + 1.2 + (stH-1.5)/2 + 0.5, side * stW/2);
        lsGroup.add(wallGlass);
    }

    // --- Barrel vault glass roof ---
    const vaultSegs = 12;
    const vaultR = stW / 2 + 0.3;
    const vaultH = 2.5;

    for (let vi = 0; vi < vaultSegs; vi++) {
        const a0 = (vi / vaultSegs) * Math.PI;
        const a1 = ((vi + 1) / vaultSegs) * Math.PI;
        const x0 = Math.cos(a0) * vaultR, y0 = Math.sin(a0) * vaultH;
        const x1 = Math.cos(a1) * vaultR, y1 = Math.sin(a1) * vaultH;
        const panelW = Math.sqrt((x1-x0)**2 + (y1-y0)**2);
        const panelAngle = Math.atan2(y1-y0, x1-x0);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(stL - 0.5, panelW), mGlass);
        panel.position.set(0, pillarH + stH + (y0+y1)/2 - 0.3, (x0+x1)/2);
        panel.rotation.x = -(Math.PI/2 - panelAngle);
        panel.rotation.order = 'ZXY';
        lsGroup.add(panel);
    }

    // Steel ribs (3 ribs along 10m)
    for (let ri = -stL/2 + 1; ri <= stL/2 - 1; ri += 3) {
        for (let vi = 1; vi <= vaultSegs; vi++) {
            const a = (vi / vaultSegs) * Math.PI;
            const pa = ((vi-1) / vaultSegs) * Math.PI;
            const rx = Math.cos(a) * vaultR, ry = Math.sin(a) * vaultH;
            const prx = Math.cos(pa) * vaultR, pry = Math.sin(pa) * vaultH;
            const ribLen = Math.sqrt((rx-prx)**2 + (ry-pry)**2);
            const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, ribLen), mSteel);
            rib.position.set(ri, pillarH + stH + (ry+pry)/2 - 0.3, (rx+prx)/2);
            rib.rotation.x = -Math.atan2(ry-pry, rx-prx);
            lsGroup.add(rib);
        }
    }

    // Ridge
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(stL + 0.5, 0.12, 0.25), mDark);
    ridge.position.set(0, pillarH + stH + vaultH - 0.3, 0);
    lsGroup.add(ridge);

    // Cable openings
    for (let ex = -1; ex <= 1; ex += 2) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 3),
            new THREE.MeshStandardMaterial({ color: 0x111111 }));
        slot.position.set(ex * (stL/2 + 0.2), pillarH + stH - 0.5, 0);
        lsGroup.add(slot);
    }

    // Bull wheel (single, center)
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.18, 12, 32), mDark);
    wheel.position.set(0, pillarH + 2.5, 0);
    wheel.rotation.y = Math.PI / 2;
    lsGroup.add(wheel);
    for (let sp = 0; sp < 8; sp++) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.2, 4), mDark);
        spoke.position.set(0, pillarH + 2.5, 0);
        spoke.rotation.x = sp * Math.PI / 4;
        spoke.rotation.y = Math.PI / 2;
        lsGroup.add(spoke);
    }

    // Platform (ground level)
    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(stL + 4, 0.25, stW + 6),
        new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8 }));
    platform.position.y = 0.12;
    platform.receiveShadow = true;
    lsGroup.add(platform);

    // Turnstiles
    for (let i = 0; i < 3; i++) {
        const ts = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 1.2),
            new THREE.MeshStandardMaterial({ color: 0xDDDDDD, metalness: 0.5 }));
        ts.position.set(-2 + i * 2, 0.8, stW/2 + 2);
        lsGroup.add(ts);
    }

    lsGroup.userData = {
        name: 'Нижня станція (920м)',
        type: 'ski-lift',
        info: 'Doppelmayr D-Line Telemix\nБетонний корпус на пілонах\nСкляний barrel-vault дах\nГондоли проходять знизу\n14 гондол + 42 крісла\n~2,184 осіб/год'
    };
    clickableObjects.push(botSlab);
    group.add(lsGroup);

    // Station label
    const lLabel = makeTextSprite('🚡 Нижня станція 920м\nDoppelmayr D-Line', { fontSize: 16, color: '#00AAFF', bgColor: 'rgba(0,0,0,0.7)' });
    lLabel.position.set(lowerX, lowerY + 22, lowerZ);
    lLabel.userData = { name: 'Нижня станція 920м — Doppelmayr D-Line', type: 'ski-lift', info:
`🚡 Doppelmayr D-Line Combo Lift
═══════════════════════════════
📍 Нижня станція: 920м | Верхня: 1200м
📏 Перепад: 280м | Довжина: ~1,340м
⚙️ Тип: Комбінований (гондола + крісло)
═══════════════════════════════
КАБІНИ НА ТРОСІ:
• 🚡 28 гондол (8-місних) — 14 на кожен напрямок
• 🪑 84 крісла (6-місних) — 42 на кожен напрямок
• 📊 56 носіїв на один напрямок
• 📊 112 носіїв загалом на підйомнику
═══════════════════════════════
ПРОПУСКНА ЗДАТНІСТЬ:
• Вгору: ~2,184 осіб/год
• (14×8 + 42×6) × ~6 циклів/год
• Швидкість: ~5 м/с
• Час підйому: ~4.5 хв
═══════════════════════════════
НИЖНЯ СТАНЦІЯ — КОМПЛЕКС:
🅿️ Паркінг: 500 авто (надземний, 2 рівні, 105×60м)
🎿 Ski Rental: 400м² (1000 комплектів, Wintersteiger)
🎿 Ski School: 150м² (збір груп)
🏪 Lockers: 150м² (камери зберігання)
🍽️ Ресторан casual: 250м² (100 місць, après-ski)
🍽️ Self-service: 300м² (150 місць)
☕ Кафе + магазин: 150м² (сувеніри, снеки)
🎫 Каси/інфо: 100м²
🚻 WC + технічне: 200м²
═══════════════════════════════
🎿 Дах паркінгу = фініш-зона лижників
• 70% криші — зона викату (runout)
• 30% — станція + сервіси
• Ескалатори × 3 між рівнями`
    };
    clickableObjects.push(lLabel);
    group.add(lLabel);

    // ============================================================
    // LOWER STATION LOGISTICS — v3 INTEGRATED
    // ============================================================
    // Concept: Parking = base podium. Roof = finish zone + services plaza.
    // Ski run LANDS on the roof. Services face the slope (NW).
    // No separate station building on roof — the existing lsGroup IS the station.
    // Lift direction: SE→NW (x=130,z=-17 toward x=-220,z=-1294)
    // Slope direction vector: dx=-350, dz=-1277 → normalized ~(-0.26, -0.96)
    // So "facing the slope" means glass facades face NW (toward negative X, negative Z)

    console.log('LOGISTICS v3: Building...');
    const cplxGroup = new THREE.Group();
    cplxGroup.name = 'Parking_Services';

    // Parking centered in site, near station
    // Site: x[5..181] z[-418..-7]. Station at x=130, z=-17
    const pkX = 95, pkZ = -50;
    const pkW = 105, pkD = 60;
    const pkY = sampleTerrainY(pkX, pkZ);
    const pkH = 7; // 2 levels × 3.2m + 0.6 roof

    // ---- PARKING PODIUM ----
    const podiumMat = new THREE.MeshStandardMaterial({ color: 0x7B7068, roughness: 0.85 });
    const podium = new THREE.Mesh(new THREE.BoxGeometry(pkW, pkH, pkD), podiumMat);
    podium.position.set(pkX, pkY + pkH/2, pkZ);
    podium.castShadow = true; podium.receiveShadow = true;
    cplxGroup.add(podium);

    // Car entry voids (south face — road side, z = pkZ + pkD/2)
    const voidMat = new THREE.MeshStandardMaterial({ color: 0x1A1A1A });
    for (let i = 0; i < 4; i++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(7, 2.8, 0.8), voidMat);
        v.position.set(pkX - 30 + i * 22, pkY + 1.8, pkZ + pkD/2);
        cplxGroup.add(v);
        // L2 entries
        const v2 = new THREE.Mesh(new THREE.BoxGeometry(7, 2.8, 0.8), voidMat);
        v2.position.set(pkX - 20 + i * 22, pkY + 5, pkZ + pkD/2);
        cplxGroup.add(v2);
    }

    // Ramp tower (SE corner)
    const rmpMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8 });
    const rampT = new THREE.Mesh(new THREE.BoxGeometry(10, pkH + 2, 14), rmpMat);
    rampT.position.set(pkX + pkW/2 + 6, pkY + (pkH+2)/2, pkZ + pkD/4);
    cplxGroup.add(rampT);

    // ---- ROOF = SKI FINISH ZONE ----
    const roofY = pkY + pkH;
    // Main deck (stone plaza)
    const roofDeck = new THREE.Mesh(
        new THREE.BoxGeometry(pkW + 6, 0.4, pkD + 6),
        new THREE.MeshStandardMaterial({ color: 0x8B7D6B, roughness: 0.5 })
    );
    roofDeck.position.set(pkX, roofY, pkZ);
    roofDeck.receiveShadow = true;
    cplxGroup.add(roofDeck);

    // Finish zone marking (red line on NW edge of roof — where skiers arrive)
    const finishLine = new THREE.Mesh(
        new THREE.BoxGeometry(40, 0.05, 1.5),
        new THREE.MeshStandardMaterial({ color: 0xFF3333 })
    );
    finishLine.position.set(pkX - 10, roofY + 0.25, pkZ - pkD/2);
    cplxGroup.add(finishLine);

    // Finish banner poles
    for (let i = 0; i < 2; i++) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0xCCCCCC }));
        pole.position.set(pkX - 30 + i * 40, roofY + 3, pkZ - pkD/2);
        cplxGroup.add(pole);
    }

    // ---- SERVICES + SKI ZONE on parking roof ----
    try {
    // Parking roof layout (N=uphill, S=road):
    //   N edge (z=-80): ski arrival from slope
    //   70% of roof (z=-80 to z=-38): SKI ZONE (runout, finish)
    //   Station at z=-38
    //   30% south (z=-38 to z=-20): SERVICES (rental, restaurant, skipass, school, WC)
    //   S edge (z=-20): escalators to parking below

    // === SKI ZONE (north 70% of roof) ===
    // Snow/ice surface marking
    const skiZone = new THREE.Mesh(
        new THREE.BoxGeometry(pkW - 4, 0.06, 42),
        new THREE.MeshStandardMaterial({ color: 0xDDEEF8, roughness: 0.3, transparent: true, opacity: 0.35 })
    );
    skiZone.position.set(pkX, roofY + 0.15, pkZ - pkD/2 + 21);  // north 70%
    cplxGroup.add(skiZone);

    // Finish line (red, at z ~ -38 where station starts)
    const finishLine = new THREE.Mesh(
        new THREE.BoxGeometry(pkW - 6, 0.05, 1.5),
        new THREE.MeshStandardMaterial({ color: 0xFF2222 })
    );
    finishLine.position.set(pkX, roofY + 0.2, -38);
    cplxGroup.add(finishLine);

    // Safety nets along ski zone edges
    const netMat = new THREE.MeshStandardMaterial({ color: 0xFF6600, transparent: true, opacity: 0.6 });
    for (let side = -1; side <= 1; side += 2) {
        const net = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 42), netMat);
        net.position.set(pkX + side * (pkW/2 - 2), roofY + 0.95, pkZ - pkD/2 + 21);
        cplxGroup.add(net);
    }

    // Ski zone direction arrows (painted on surface)
    for (let ai = 0; ai < 5; ai++) {
        const arrowZ = -75 + ai * 9;
        const arrow = new THREE.Mesh(
            new THREE.ConeGeometry(1.5, 3, 3),
            new THREE.MeshStandardMaterial({ color: 0x4488FF, transparent: true, opacity: 0.5 })
        );
        arrow.position.set(pkX, roofY + 0.15, arrowZ);
        arrow.rotation.x = Math.PI; // point south (toward finish)
        cplxGroup.add(arrow);
    }

    // === SERVICES (south 30% of roof, z=-38 to z=-20) ===
    const svcY = roofY + 0.4;
    const svcRowZ = -28;  // center of services row (between station z=-38 and S edge z=-20)
    const svcMat1 = new THREE.MeshStandardMaterial({ color: 0x7B6B5F, roughness: 0.8 });
    const svcMat2 = new THREE.MeshStandardMaterial({ color: 0x6B5B4F, roughness: 0.8 });
    const svcGlass = new THREE.MeshStandardMaterial({ color: 0x88CCDD, metalness: 0.35, transparent: true, opacity: 0.45 });
    const svcWood = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 });

    // A: Ski Rental + Lockers (left/west side, 28×10m)
    const rentX = pkX - 22, rentZ = svcRowZ;
    const rentBldg = new THREE.Mesh(new THREE.BoxGeometry(28, 4.5, 10), svcMat1);
    rentBldg.position.set(rentX, svcY + 2.25, rentZ);
    rentBldg.castShadow = true;
    cplxGroup.add(rentBldg);
    // Glass facade (north face — toward ski zone)
    cplxGroup.add((() => { const m = new THREE.Mesh(new THREE.BoxGeometry(28, 3.5, 0.1), svcGlass); m.position.set(rentX, svcY+2.5, rentZ - 5); return m; })());
    cplxGroup.add((() => { const m = new THREE.Mesh(new THREE.BoxGeometry(30, 0.35, 11), svcWood); m.position.set(rentX, svcY+4.7, rentZ); return m; })());

    // B: Restaurant + Cafe (right/east side, 26×10m)
    const restX = pkX + 24, restZ = svcRowZ;
    const restBldg = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 10), svcMat2);
    restBldg.position.set(restX, svcY + 2.5, restZ);
    restBldg.castShadow = true;
    cplxGroup.add(restBldg);
    cplxGroup.add((() => { const m = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 0.1), svcGlass); m.position.set(restX, svcY+2.8, restZ - 5); return m; })());
    cplxGroup.add((() => { const m = new THREE.Mesh(new THREE.BoxGeometry(28, 0.35, 11), svcWood); m.position.set(restX, svcY+5.2, restZ); return m; })());

    // C: Outdoor terrace (between buildings, facing ski zone)
    const terrDeck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: 0xA08060, roughness: 0.55 }));
    terrDeck.position.set(pkX + 1, roofY + 0.08, svcRowZ - 4);
    cplxGroup.add(terrDeck);

    // Tables + umbrellas
    const umbColors = [0xCC3333, 0x339933, 0x3355CC, 0xCCAA33];
    for (let tx = 0; tx < 3; tx++) {
        for (let tz = 0; tz < 2; tz++) {
            const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.65, 8),
                new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.5 }));
            tbl.position.set(pkX - 3 + tx * 5, roofY + 0.5, svcRowZ - 6 + tz * 3);
            cplxGroup.add(tbl);
            const u = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 8),
                new THREE.MeshStandardMaterial({ color: umbColors[tx] }));
            u.position.set(pkX - 3 + tx * 5, roofY + 2.5, svcRowZ - 6 + tz * 3);
            cplxGroup.add(u);
        }
    }

    // D: Skipass kiosks (center, between rental and restaurant)
    const skipassBldg = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 4),
        new THREE.MeshStandardMaterial({ color: 0x5A5A7A, roughness: 0.7 }));
    skipassBldg.position.set(pkX + 1, roofY + 1.7, svcRowZ + 2);
    cplxGroup.add(skipassBldg);

    // E: Ski School (next to rental, south side)
    const schoolBldg = new THREE.Mesh(new THREE.BoxGeometry(8, 3.5, 5),
        new THREE.MeshStandardMaterial({ color: 0x5A7A5A, roughness: 0.7 }));
    schoolBldg.position.set(rentX + 18, roofY + 2, svcRowZ + 2);
    cplxGroup.add(schoolBldg);

    // F: WC (SE corner)
    const wcBldg = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4),
        new THREE.MeshStandardMaterial({ color: 0x5A5A5A, roughness: 0.8 }));
    wcBldg.position.set(pkX + 42, roofY + 1.7, svcRowZ + 3);
    cplxGroup.add(wcBldg);

    // G: Escalators (south edge, 3 glass shafts going down to parking)
    for (let ei = 0; ei < 3; ei++) {
        const escX = pkX - 15 + ei * 15;
        const escBox = new THREE.Mesh(
            new THREE.BoxGeometry(3.5, pkH + 1.5, 2.5),
            new THREE.MeshStandardMaterial({ color: 0x88BBDD, metalness: 0.3, transparent: true, opacity: 0.35 }));
        escBox.position.set(escX, pkY + pkH/2 + 0.8, pkZ + pkD/2 - 3);  // south edge
        cplxGroup.add(escBox);
    }

    // === LABELS ===
    const lblY = roofY + 12;
    const labels = [
        ['🅿️ Паркінг 500 авто · 2 рівні', pkX, lblY + 2, pkZ + 18, '#FFD700', 14],
        ['⛷ ЗОНА ЛИЖНИКІВ\n70% криші · викат', pkX, roofY + 4, pkZ - pkD/2 + 21, '#88CCFF', 14],
        ['🏁 ФІНІШ', pkX + 20, roofY + 2, -38, '#FF4444', 14],
        ['🎿 Ski Rental 1000\n🔐 Lockers 200', rentX, lblY, rentZ, '#FFD700', 13],
        ['🍽 Ресторан 250 місць\n☕ Après-ski тераса', restX, lblY, restZ, '#FF8800', 13],
        ['🎫 Skipass', pkX + 1, lblY - 4, svcRowZ, '#AADDFF', 12],
        ['⛷ Ski School', rentX + 18, lblY - 4, svcRowZ, '#AAFFAA', 12],
        ['🚻', pkX + 42, roofY + 5, svcRowZ, '#CCCCCC', 11],
        ['↗ Ескалатори ×3', pkX, roofY + 5, pkZ + pkD/2 - 3, '#AADDFF', 11],
    ];
    for (const [text, lx, ly, lz, color, size] of labels) {
        const spr = makeTextSprite(text, { fontSize: size, color, bgColor: 'rgba(0,0,0,0.6)' });
        spr.position.set(lx, ly, lz);
        cplxGroup.add(spr);
    }

    cplxGroup.userData = {
        name: 'Логістичний комплекс нижньої станції',
        type: 'logistics',
        info: '🅿️ Паркінг 500 авто (2 рівні)\n🏁 Фініш зона на даху\n🎿 Ski Rental 1000 комплектів\n🍽 Ресторани 250 місць (фасад → трасу)\n⛷ Ski School · 🎫 Skipass\n🔐 Lockers 200 · ↗ 3 ескалатори'
    };
    clickableObjects.push(podium);
    clickableObjects.push(rentBldg);
    clickableObjects.push(restBldg);
    group.add(cplxGroup);

    console.log('LOGISTICS v3: done!', cplxGroup.children.length, 'objects');
    } catch(e) { console.error('LOGISTICS ERROR:', e.message, e.stack); }

    // ============================================================
    // UPPER STATION (1200m) — Mountain top station
    // ============================================================
    const usGroup = new THREE.Group();
    usGroup.position.set(upperX, upperY, upperZ);

    // Stone base embedded in slope
    const usBase = new THREE.Mesh(
        new THREE.BoxGeometry(20, 4, 12),
        new THREE.MeshStandardMaterial({ color: 0x7B6B5F, roughness: 0.9 })
    );
    usBase.position.y = 2;
    usBase.castShadow = true;
    usGroup.add(usBase);

    // Glass observation hall
    const usHall = new THREE.Mesh(
        new THREE.BoxGeometry(18, 4, 10),
        new THREE.MeshStandardMaterial({ color: 0x8FBCBB, metalness: 0.4, roughness: 0.2, transparent: true, opacity: 0.5 })
    );
    usHall.position.y = 6;
    usHall.castShadow = true;
    usGroup.add(usHall);

    // Angled roof (ski slope style)
    const usRoof = new THREE.Mesh(
        new THREE.BoxGeometry(22, 0.5, 14),
        new THREE.MeshStandardMaterial({ color: 0x4A4A4A, metalness: 0.5 })
    );
    usRoof.position.set(0, 8.5, 0);
    usRoof.rotation.z = 0.1;
    usRoof.castShadow = true;
    usGroup.add(usRoof);

    // Cable tower
    const usTower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.9, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6 })
    );
    usTower.position.set(6, 6, 0);
    usGroup.add(usTower);

    // Bull wheel
    const usWheel = new THREE.Mesh(
        new THREE.TorusGeometry(2, 0.3, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 })
    );
    usWheel.position.set(6, 12, 0);
    usWheel.rotation.y = Math.PI / 2;
    usGroup.add(usWheel);

    // Observation deck
    const usDeck = new THREE.Mesh(
        new THREE.CylinderGeometry(6, 6, 0.3, 16),
        new THREE.MeshStandardMaterial({ color: 0x9B8B7B, roughness: 0.8 })
    );
    usDeck.position.set(-6, 8.5, 4);
    usGroup.add(usDeck);

    // Railing around deck
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const rPost = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 1.1, 4),
            new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 })
        );
        rPost.position.set(-6 + Math.cos(a) * 5.8, 9.2, 4 + Math.sin(a) * 5.8);
        usGroup.add(rPost);
    }

    usGroup.userData = { name: 'Верхня станція (1200м)', type: 'ski-lift', info:
`🏔️ Верхня станція — 1200м
═══════════════════════════════
📍 Координати: 48.4651°N, 24.4955°E
📏 Висота: 1200м над р.м.
⛰️ Перепад від нижньої: 280м
═══════════════════════════════
БУДІВЛЯ:
• Кам'яний цоколь 20×12м (вмурований в схил)
• Скляний зал очікування 18×10м
• Оглядовий майданчик (Ø12м)
• Кабельна вежа 12м + bull wheel
═══════════════════════════════
СТАРТ ТРАСИ:
• 🔵 Легка синя №1 (ширина ~120м)
• Довжина: ~1,340м
• Перепад: 280м
• Фініш: дах паркінгу нижньої станції`
    };
    clickableObjects.push(usBase);
    group.add(usGroup);

    const uLabel = makeTextSprite('Верхня станція 1200м', { fontSize: 18, color: '#FF6600', bgColor: 'rgba(0,0,0,0.7)' });
    uLabel.position.set(upperX, upperY + 18, upperZ);
    uLabel.userData = { name: 'Верхня станція 1200м', type: 'ski-lift' };
    clickableObjects.push(uLabel);
    group.add(uLabel);

    // ---- CABLE LINE (poles on terrain) ----
    const numPoles = 16;
    const poleHeight = 10;
    const cablePoints = [];
    for (let i = 0; i <= numPoles; i++) {
        const t = i / numPoles;
        const cx = lowerX + (upperX - lowerX) * t;
        const cz = lowerZ + (upperZ - lowerZ) * t;
        const terrainY = sampleTerrainY(cx, cz);
        const cableY = terrainY + poleHeight + Math.sin(t * Math.PI) * 3;
        cablePoints.push(new THREE.Vector3(cx, cableY, cz));

        // Poles on terrain
        if (i > 0 && i < numPoles) {
            const pH = poleHeight + Math.sin(t * Math.PI) * 3;
            const poleGeo = new THREE.CylinderGeometry(0.3, 0.4, pH, 6);
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(cx, terrainY + pH / 2, cz);
            pole.castShadow = true;
            group.add(pole);
        }
    }

    // ---- DOPPELMAYR TELEMIX: Single haul rope per direction ----
    // Uphill cable (main)
    const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePoints);
    const cableMat = new THREE.LineBasicMaterial({ color: 0x222222, linewidth: 2 });
    const cable = new THREE.Line(cableGeo, cableMat);
    group.add(cable);

    // Downhill cable (return, offset 4m laterally)
    const cable2Points = cablePoints.map(p => new THREE.Vector3(p.x + 4, p.y - 0.3, p.z + 4));
    const cable2 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(cable2Points),
        new THREE.LineBasicMaterial({ color: 0x333333 })
    );
    group.add(cable2);

    // ============================================================
    // DOPPELMAYR TELEMIX / CHONDOLA — Combined Lift System
    // Pattern: G-C-C-C-G-C-C-C... (1 gondola per 3 chairs)
    // Both directions on same haul rope per side
    // ============================================================
    const telemixGroup = new THREE.Group();
    telemixGroup.name = 'Telemix_Doppelmayr';

    // Shared materials
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.3 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.8 });
    const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xAADDFF, metalness: 0.15, roughness: 0.1, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const gondolaBodyMat = new THREE.MeshStandardMaterial({ color: 0xDD3333, metalness: 0.3, roughness: 0.5 });
    const gondolaWinMat = new THREE.MeshStandardMaterial({ color: 0x88CCFF, metalness: 0.5, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.4 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });

    // Total carriers per direction
    const totalPerDir = 56; // 14 gondolas + 42 chairs
    // Pattern repeats: G C C C (every 4th is gondola)
    const gondolaInterval = 4;

    function buildGondola(parent) {
        // Detachable grip clamp
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.3), gripMat);
        grip.position.set(0, -0.12, 0);
        parent.add(grip);

        // Hanger arm
        const hLen = 2.2;
        const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, hLen, 6), metalMat);
        hanger.position.set(0, -0.25 - hLen/2, 0);
        parent.add(hanger);

        // 8-person cabin body
        const bw = 2.2, bh = 2.5, bd = 2.0;
        const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), gondolaBodyMat);
        body.position.set(0, -0.25 - hLen - bh/2, 0);
        body.castShadow = true;
        parent.add(body);

        // Windows on all 4 sides
        for (const zOff of [bd/2 + 0.02, -(bd/2 + 0.02)]) {
            const w = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.75, bh * 0.55), gondolaWinMat);
            w.position.set(0, -0.25 - hLen - bh/2, zOff);
            parent.add(w);
        }
        for (const xOff of [bw/2 + 0.02, -(bw/2 + 0.02)]) {
            const w = new THREE.Mesh(new THREE.PlaneGeometry(bd * 0.65, bh * 0.55), gondolaWinMat);
            w.position.set(xOff, -0.25 - hLen - bh/2, 0);
            w.rotation.y = Math.PI / 2;
            parent.add(w);
        }

        // Roof (rounded look)
        const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.3, 0.2, bd + 0.3), plateMat);
        roof.position.set(0, -0.25 - hLen + 0.1, 0);
        parent.add(roof);

        // Floor
        const floor = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.15, 0.15, bd + 0.15), plateMat);
        floor.position.set(0, -0.25 - hLen - bh - 0.08, 0);
        parent.add(floor);

        // Door indicators (dark strips on sides)
        for (const xOff of [bw/2 + 0.03, -(bw/2 + 0.03)]) {
            const door = new THREE.Mesh(
                new THREE.PlaneGeometry(0.08, bh * 0.85),
                new THREE.MeshStandardMaterial({ color: 0x222222, side: THREE.DoubleSide })
            );
            door.position.set(xOff, -0.25 - hLen - bh/2, 0);
            door.rotation.y = Math.PI / 2;
            parent.add(door);
        }
    }

    function buildChair6(parent) {
        // Detachable grip clamp
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.25), gripMat);
        grip.position.set(0, -0.1, 0);
        parent.add(grip);

        // Hanger arm
        const hLen = 2.8;
        const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, hLen, 5), metalMat);
        hanger.position.set(0, -0.2 - hLen/2, 0);
        parent.add(hanger);

        // Crossbar
        const sw = 3.4;
        const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, sw, 5), metalMat);
        crossbar.position.set(0, -0.2 - hLen, 0);
        crossbar.rotation.z = Math.PI / 2;
        parent.add(crossbar);

        // 6 individual seats with padding
        for (let s = 0; s < 6; s++) {
            const sx = (s - 2.5) * 0.55;
            // Seat cushion
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.44), seatMat);
            seat.position.set(sx, -0.2 - hLen - 0.28, 0);
            parent.add(seat);
            // Backrest
            const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.08), seatMat);
            back.position.set(sx, -0.2 - hLen + 0.03, -0.21);
            parent.add(back);
        }

        // Armrests (outer + center dividers)
        for (let a = -3; a <= 3; a++) {
            if (a === 0) continue;
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.4), metalMat);
            arm.position.set(a * 0.55, -0.2 - hLen - 0.14, 0.02);
            parent.add(arm);
        }

        // Safety bar (lowered position)
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, sw - 0.4, 5), metalMat);
        bar.position.set(0, -0.2 - hLen - 0.08, 0.32);
        bar.rotation.z = Math.PI / 2;
        parent.add(bar);

        // Footrest
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, sw - 0.6, 5), metalMat);
        foot.position.set(0, -0.2 - hLen - 0.82, 0.38);
        foot.rotation.z = Math.PI / 2;
        parent.add(foot);

        // Individual footrests
        for (let s = 0; s < 6; s++) {
            const sx = (s - 2.5) * 0.55;
            const fpad = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.15), seatMat);
            fpad.position.set(sx, -0.2 - hLen - 0.88, 0.42);
            parent.add(fpad);
        }

        // Bubble weather cover
        const bubble = new THREE.Mesh(
            new THREE.SphereGeometry(2.0, 10, 6, 0, Math.PI, 0, Math.PI * 0.5),
            bubbleMat
        );
        bubble.position.set(0, -0.2 - hLen + 0.65, -0.1);
        bubble.rotation.x = -0.3;
        parent.add(bubble);
    }

    // Place carriers on BOTH cables (uphill + downhill)
    for (let dir = 0; dir < 2; dir++) {
        const pts = dir === 0 ? cablePoints : cable2Points;
        for (let i = 0; i < totalPerDir; i++) {
            const t = (i + 0.5) / totalPerDir;
            const ptIdx = Math.min(Math.floor(t * (pts.length - 1)), pts.length - 2);
            const ptFrac = t * (pts.length - 1) - ptIdx;
            const p0 = pts[ptIdx], p1 = pts[ptIdx + 1];
            const cx = p0.x + (p1.x - p0.x) * ptFrac;
            const cy = p0.y + (p1.y - p0.y) * ptFrac;
            const cz = p0.z + (p1.z - p0.z) * ptFrac;
            const dx = p1.x - p0.x, dz = p1.z - p0.z;
            const angle = Math.atan2(dx, dz);

            const carrier = new THREE.Group();
            carrier.position.set(cx, cy, cz);
            carrier.rotation.y = angle;

            const isGondola = (i % gondolaInterval === 0);
            if (isGondola) {
                buildGondola(carrier);
            } else {
                buildChair6(carrier);
            }

            carrier.castShadow = true;
            telemixGroup.add(carrier);
        }
    }

    group.add(telemixGroup);

    // Stats — per side = per direction, total = whole lift
    const gondolasPerSide = Math.floor(totalPerDir / gondolaInterval); // 14
    const chairsPerSide = totalPerDir - gondolasPerSide;               // 42
    const totalGondolas = gondolasPerSide * 2;  // 28 on entire lift
    const totalChairs = chairsPerSide * 2;      // 84 on entire lift
    const totalCarriers = totalGondolas + totalChairs; // 112

    // Capacity = one direction only (uphill)
    // seats per side × dispatches/hour (at 6m/s, ~23s interval = ~156/hr)
    const seatsPerSide = gondolasPerSide * 8 + chairsPerSide * 6; // 14*8 + 42*6 = 364
    const ridesPerHour = 6; // ~8 min ride, carriers recirculate
    const capacityPPH = seatsPerSide * ridesPerHour; // ~2184 pph uphill

    console.log(`Doppelmayr Telemix D-Line:`);
    console.log(`  Per side: ${gondolasPerSide} gondolas (8p) + ${chairsPerSide} chairs (6p) = ${totalPerDir} carriers`);
    console.log(`  Total lift: ${totalGondolas} gondolas + ${totalChairs} chairs = ${totalCarriers} carriers`);
    console.log(`  Seats per side: ${seatsPerSide} | Capacity: ~${capacityPPH} pph (uphill)`);

    scene.add(group);
    return group;
}

// ============================================================
// TECHNOALPIN TR10 SNOW GUNS ON TOWERS
// Tower-mounted fan guns along ski run edges
// TR10 specs (approx): fan Ø0.9m, total height on tower ~10m,
// gun body ~1.6×1.0×1.2m, tower pipe Ø0.3m
// ============================================================
function buildSnowGuns() {
    const group = new THREE.Group();
    group.name = 'SnowGuns_TR10';

    // Materials
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xBBBBBB, metalness: 0.7, roughness: 0.3 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xEEEEEE, metalness: 0.3, roughness: 0.5 });
    const fanMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.4 });
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x4488CC, metalness: 0.6, roughness: 0.3 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.4, roughness: 0.6 });
    const technoBlue = new THREE.MeshStandardMaterial({ color: 0x0066AA, metalness: 0.3, roughness: 0.5 });

    // Snow gun positions — single line along lift cable (left side of run)
    // Close to lift for easy pipeline access
    // Lift: lower (129.8, -17) → upper (-219.6, -1294)
    const liftLowerX = 129.8, liftLowerZ = -17;
    const liftUpperX = -219.6, liftUpperZ = -1294;

    // Place guns every ~80m along lift line, offset 8m towards run
    const liftLen = Math.sqrt((liftUpperX - liftLowerX)**2 + (liftUpperZ - liftLowerZ)**2);
    const numGuns = Math.floor(liftLen / 80);
    const liftDirX = (liftUpperX - liftLowerX) / liftLen;
    const liftDirZ = (liftUpperZ - liftLowerZ) / liftLen;
    // Perpendicular to lift (towards run = left side when going uphill)
    const perpX = liftDirZ;
    const perpZ = -liftDirX;
    const pipeOffset = 8; // 8m from lift line (easy pipeline)

    let gunCount = 0;

    for (let g = 0; g < numGuns; g++) {
        const t = (g + 1) / (numGuns + 1); // skip very start/end (stations)
        const baseX = liftLowerX + (liftUpperX - liftLowerX) * t;
        const baseZ = liftLowerZ + (liftUpperZ - liftLowerZ) * t;

        // Offset perpendicular towards run side
        const gx = baseX + perpX * pipeOffset;
        const gz = baseZ + perpZ * pipeOffset;
            const terrY = sampleTerrainY(gx, gz);

            // Tower height varies 8-12m
            const towerH = 8 + Math.random() * 4;

            const gunGroup = new THREE.Group();
            gunGroup.position.set(gx, terrY, gz);

            // ---- CONCRETE BASE PAD ----
            const base = new THREE.Mesh(
                new THREE.CylinderGeometry(0.8, 1.0, 0.5, 8),
                baseMat
            );
            base.position.y = 0.25;
            gunGroup.add(base);

            // ---- TOWER (galvanized steel pipe) ----
            const tower = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.18, towerH, 8),
                towerMat
            );
            tower.position.y = towerH / 2 + 0.5;
            tower.castShadow = true;
            gunGroup.add(tower);

            // Tower service ladder (rungs)
            for (let r = 1; r < towerH - 1; r += 0.8) {
                const rung = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4),
                    towerMat
                );
                rung.position.set(0.2, r + 0.5, 0);
                rung.rotation.z = Math.PI / 2;
                gunGroup.add(rung);
            }

            // ---- PIVOT HEAD (allows tilting) ----
            const pivot = new THREE.Mesh(
                new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8),
                fanMat
            );
            pivot.position.y = towerH + 0.5 + 0.15;
            gunGroup.add(pivot);

            // ---- GUN BODY (TR10 housing) ----
            // Main cylindrical body
            const bodyLen = 1.6;
            const bodyR = 0.5;

            // Aim perpendicular from lift towards run, tilted up ~30°
            const aimAngle = Math.atan2(perpX, perpZ);
            const tiltAngle = -0.5; // ~30° up

            const gunBody = new THREE.Group();
            gunBody.position.y = towerH + 0.5 + 0.3;
            gunBody.rotation.y = aimAngle;

            // Main barrel
            const barrel = new THREE.Mesh(
                new THREE.CylinderGeometry(bodyR, bodyR * 0.9, bodyLen, 12),
                bodyMat
            );
            barrel.rotation.x = tiltAngle;
            barrel.position.z = bodyLen / 2 * Math.cos(tiltAngle);
            barrel.position.y = bodyLen / 2 * Math.sin(-tiltAngle);
            barrel.rotation.z = Math.PI / 2;
            gunBody.add(barrel);

            // Fan housing (front ring, Ø0.9m)
            const fanRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.45, 0.06, 8, 16),
                fanMat
            );
            const frontZ = bodyLen * Math.cos(tiltAngle);
            const frontY = bodyLen * Math.sin(-tiltAngle);
            fanRing.position.set(0, frontY, frontZ);
            fanRing.rotation.x = tiltAngle;
            gunBody.add(fanRing);

            // Fan blades (6 blades)
            for (let b = 0; b < 6; b++) {
                const bladeAngle = (b / 6) * Math.PI * 2;
                const blade = new THREE.Mesh(
                    new THREE.BoxGeometry(0.35, 0.04, 0.12),
                    fanMat
                );
                blade.position.set(
                    Math.cos(bladeAngle) * 0.22,
                    frontY + Math.sin(bladeAngle) * 0.22,
                    frontZ
                );
                blade.rotation.z = bladeAngle;
                gunBody.add(blade);
            }

            // Nozzle ring (24 nozzles around fan)
            for (let n = 0; n < 12; n++) {
                const na = (n / 12) * Math.PI * 2;
                const nozzle = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.025, 0.015, 0.12, 4),
                    nozzleMat
                );
                nozzle.position.set(
                    Math.cos(na) * 0.48,
                    frontY + Math.sin(na) * 0.48,
                    frontZ + 0.06
                );
                gunBody.add(nozzle);
            }

            // TechnoAlpin blue accent stripe
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(0.02, bodyR * 1.5, bodyLen * 0.6),
                technoBlue
            );
            stripe.position.set(bodyR + 0.01, frontY * 0.3, frontZ * 0.4);
            stripe.rotation.x = tiltAngle;
            gunBody.add(stripe);

            // Water/air pipe connections at back
            const pipe1 = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4),
                nozzleMat
            );
            pipe1.position.set(0.15, -0.1, -0.2);
            pipe1.rotation.x = Math.PI / 2;
            gunBody.add(pipe1);

            const pipe2 = new THREE.Mesh(
                new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4),
                towerMat
            );
            pipe2.position.set(-0.15, -0.1, -0.2);
            pipe2.rotation.x = Math.PI / 2;
            gunBody.add(pipe2);

            gunGroup.add(gunBody);

            // ---- WATER HYDRANT at base ----
            const hydrant = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6),
                nozzleMat
            );
            hydrant.position.set(0.5, 0.8, 0);
            gunGroup.add(hydrant);

            // Hydrant cap
            const hcap = new THREE.Mesh(
                new THREE.SphereGeometry(0.1, 6, 6),
                nozzleMat
            );
            hcap.position.set(0.5, 1.15, 0);
            gunGroup.add(hcap);

            gunGroup.castShadow = true;
            group.add(gunGroup);
            gunCount++;
    }

    // ---- PIPELINE connecting all guns (water supply) ----
    const pipePts = [];
    for (let g = 0; g < numGuns; g++) {
        const t = (g + 1) / (numGuns + 1);
        const bx = liftLowerX + (liftUpperX - liftLowerX) * t + perpX * pipeOffset;
        const bz = liftLowerZ + (liftUpperZ - liftLowerZ) * t + perpZ * pipeOffset;
        const ty = sampleTerrainY(bx, bz);
        pipePts.push(new THREE.Vector3(bx, ty + 0.3, bz));
    }
    if (pipePts.length >= 2) {
        const pipeGeo = new THREE.BufferGeometry().setFromPoints(pipePts);
        const pipeLine = new THREE.Line(pipeGeo, new THREE.LineBasicMaterial({ color: 0x4488CC, linewidth: 2 }));
        group.add(pipeLine);

        // Thicker pipe visualization (tube along terrain)
        const pipeCurve = new THREE.CatmullRomCurve3(pipePts);
        const tubeGeo = new THREE.TubeGeometry(pipeCurve, pipePts.length * 4, 0.08, 6, false);
        const tube = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({ color: 0x4488CC, metalness: 0.5, roughness: 0.4 }));
        group.add(tube);
    }

    scene.add(group);
    console.log(`TechnoAlpin TR10: ${gunCount} snow guns in line along lift (${pipeOffset}m offset), pipeline connected`);
    return group;
}

// ============================================================
// PARDORAMA — Panoramic Restaurant at Upper Station (1200m)
// Inspired by Pardorama Ischgl: 3-storey glass+steel, 1000m² facade
// 600+ seats, barrel-vault roof, on 3-point foundation
// ============================================================
function buildPardorama() {
    const group = new THREE.Group();
    group.name = 'Pardorama_Restaurant';

    // Position: LEFT of upper station (west = more negative X)
    const ux = -219.6, uz = -1294;
    const uy = sampleTerrainY(ux, uz);
    // Offset 40m west (left) and 10m south
    const px = ux - 40, pz = uz + 10;
    const py = sampleTerrainY(px, pz);

    // Building dimensions (inspired by Pardorama)
    const bW = 40;   // width (along slope)
    const bD = 18;   // depth (perpendicular)
    const floorH = 3.5;  // per floor
    const floors = 3;
    const totalH = floors * floorH;
    const pillarH = 4;   // raised on pillars

    // Rotation to face the valley (SE direction)
    const rotY = Math.atan2(-(-1294 - (-38)), -(-219.6 - 124)); // face down the slope

    // Materials
    const mConcrete = new THREE.MeshStandardMaterial({ color: 0xD8D4D0, roughness: 0.6 });
    const mGlass = new THREE.MeshStandardMaterial({ color: 0x7BC0E0, metalness: 0.6, roughness: 0.05, transparent: true, opacity: 0.3 });
    const mSteel = new THREE.MeshStandardMaterial({ color: 0x8A8A8A, metalness: 0.8, roughness: 0.2 });
    const mWood = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.7 });
    const mRoof = new THREE.MeshStandardMaterial({ color: 0x4A4A4A, metalness: 0.6, roughness: 0.3 });

    const bGroup = new THREE.Group();
    bGroup.position.set(px, py, pz);
    bGroup.rotation.y = rotY;

    // === 3 PILLARS (V-shaped supports) ===
    for (let i = -1; i <= 1; i++) {
        const pillarX = i * (bW / 3);
        // Front pillar
        const pGeo = new THREE.CylinderGeometry(0.4, 0.5, pillarH + totalH, 8);
        const pillar = new THREE.Mesh(pGeo, mConcrete);
        pillar.position.set(pillarX, (pillarH + totalH) / 2, bD / 3);
        bGroup.add(pillar);
        // Back pillar
        const p2 = new THREE.Mesh(pGeo, mConcrete);
        p2.position.set(pillarX, (pillarH + totalH) / 2, -bD / 3);
        bGroup.add(p2);
    }

    // === FLOOR SLABS (3 floors) ===
    for (let f = 0; f < floors; f++) {
        const slabY = pillarH + f * floorH;
        const slabGeo = new THREE.BoxGeometry(bW + 2, 0.35, bD + 2);
        const slab = new THREE.Mesh(slabGeo, mConcrete);
        slab.position.set(0, slabY, 0);
        bGroup.add(slab);

        // Glass walls on all 4 sides
        const panelW = 2.5;
        // Front (valley-facing) — full glass
        const nPanels = Math.floor(bW / panelW);
        for (let p = 0; p < nPanels; p++) {
            const gGeo = new THREE.PlaneGeometry(panelW - 0.08, floorH - 0.4);
            const glass = new THREE.Mesh(gGeo, mGlass);
            glass.position.set(-bW / 2 + panelW / 2 + p * panelW, slabY + floorH / 2, bD / 2 + 1.01);
            bGroup.add(glass);
        }
        // Back — glass with less opacity
        for (let p = 0; p < nPanels; p++) {
            const gGeo = new THREE.PlaneGeometry(panelW - 0.08, floorH - 0.4);
            const glass = new THREE.Mesh(gGeo, mGlass);
            glass.position.set(-bW / 2 + panelW / 2 + p * panelW, slabY + floorH / 2, -bD / 2 - 1.01);
            glass.rotation.y = Math.PI;
            bGroup.add(glass);
        }
        // Sides
        const nSide = Math.floor(bD / panelW);
        for (let p = 0; p < nSide; p++) {
            const gGeo = new THREE.PlaneGeometry(panelW - 0.08, floorH - 0.4);
            const g1 = new THREE.Mesh(gGeo, mGlass);
            g1.position.set(bW / 2 + 1.01, slabY + floorH / 2, -bD / 2 + panelW / 2 + p * panelW);
            g1.rotation.y = Math.PI / 2;
            bGroup.add(g1);
            const g2 = new THREE.Mesh(gGeo, mGlass);
            g2.position.set(-bW / 2 - 1.01, slabY + floorH / 2, -bD / 2 + panelW / 2 + p * panelW);
            g2.rotation.y = -Math.PI / 2;
            bGroup.add(g2);
        }

        // Steel mullions (vertical)
        for (let p = 0; p <= nPanels; p++) {
            const mGeo = new THREE.BoxGeometry(0.06, floorH, 0.06);
            const mul = new THREE.Mesh(mGeo, mSteel);
            mul.position.set(-bW / 2 + p * panelW, slabY + floorH / 2, bD / 2 + 1);
            bGroup.add(mul);
        }
    }

    // === BARREL-VAULT ROOF ===
    const roofY = pillarH + floors * floorH;
    const roofH = 3;
    const roofSegs = 16;
    for (let i = 0; i <= roofSegs; i++) {
        const angle = (i / roofSegs) * Math.PI;
        const ry = Math.sin(angle) * roofH;
        const rz = Math.cos(angle) * (bD / 2 + 1.5);

        // Steel rib
        const ribGeo = new THREE.BoxGeometry(bW + 2, 0.08, 0.08);
        const rib = new THREE.Mesh(ribGeo, mSteel);
        rib.position.set(0, roofY + ry, rz);
        bGroup.add(rib);
    }

    // Roof glass panels between ribs
    for (let i = 0; i < roofSegs; i++) {
        const a1 = (i / roofSegs) * Math.PI;
        const a2 = ((i + 1) / roofSegs) * Math.PI;
        const y1 = roofY + Math.sin(a1) * roofH;
        const z1 = Math.cos(a1) * (bD / 2 + 1.5);
        const y2 = roofY + Math.sin(a2) * roofH;
        const z2 = Math.cos(a2) * (bD / 2 + 1.5);

        const midY = (y1 + y2) / 2;
        const midZ = (z1 + z2) / 2;
        const segLen = Math.sqrt((y2 - y1) ** 2 + (z2 - z1) ** 2);
        const segAngle = Math.atan2(y2 - y1, z2 - z1);

        const pGeo = new THREE.PlaneGeometry(bW + 1.5, segLen);
        const panel = new THREE.Mesh(pGeo, new THREE.MeshStandardMaterial({
            color: 0x8ECCE8, metalness: 0.4, roughness: 0.05, transparent: true, opacity: 0.2, side: THREE.DoubleSide
        }));
        panel.position.set(0, midY, midZ);
        panel.rotation.x = segAngle - Math.PI / 2;
        bGroup.add(panel);
    }

    // === TOP SLAB (roof floor) ===
    const topSlab = new THREE.Mesh(
        new THREE.BoxGeometry(bW + 2, 0.3, bD + 2),
        mConcrete
    );
    topSlab.position.set(0, roofY, 0);
    bGroup.add(topSlab);

    // === VIEWING TERRACE (cantilevered, front) ===
    const terrGeo = new THREE.BoxGeometry(bW + 6, 0.25, 5);
    const terrace = new THREE.Mesh(terrGeo, mWood);
    terrace.position.set(0, pillarH + floorH, bD / 2 + 3.5);
    bGroup.add(terrace);

    // Terrace railing
    const railGeo = new THREE.BoxGeometry(bW + 6, 1.1, 0.05);
    const rail = new THREE.Mesh(railGeo, mSteel);
    rail.position.set(0, pillarH + floorH + 0.7, bD / 2 + 5.9);
    bGroup.add(rail);

    // === FOLIE DOUCE APRÈS-SKI TERRACE ===
    // Multi-level amphitheatre terrace, DJ stage, sun-facing
    // Inspired by La Folie Douce Val Thorens (JMV Resort)
    const tGroup = new THREE.Group();
    tGroup.position.set(px, py, pz);
    tGroup.rotation.y = rotY;

    const mWoodDeck = new THREE.MeshStandardMaterial({ color: 0x9B7B3A, roughness: 0.65 });
    const mRed = new THREE.MeshStandardMaterial({ color: 0xCC3333, roughness: 0.4 });
    const mBlack = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.3 });

    // 4 cascading terrace levels (amphitheatre style) — valley-facing (front)
    const terrLevels = 4;
    const terrW = bW + 10; // wider than building
    const stepD = 4;       // depth per step
    const stepH = 0.6;     // height per step

    for (let t = 0; t < terrLevels; t++) {
        const tY = pillarH - (t + 1) * stepH;
        const tZ = bD / 2 + 2 + t * stepD;
        const tDepth = stepD - 0.3;

        // Deck slab
        const deckGeo = new THREE.BoxGeometry(terrW, 0.2, tDepth);
        const deck = new THREE.Mesh(deckGeo, mWoodDeck);
        deck.position.set(0, tY, tZ + tDepth / 2);
        tGroup.add(deck);

        // Step riser
        const riserGeo = new THREE.BoxGeometry(terrW, stepH, 0.15);
        const riser = new THREE.Mesh(riserGeo, mWood);
        riser.position.set(0, tY + stepH / 2, tZ);
        tGroup.add(riser);

        // Bench rows (seating)
        if (t < terrLevels - 1) {
            const benchGeo = new THREE.BoxGeometry(terrW - 2, 0.4, 0.5);
            const bench = new THREE.Mesh(benchGeo, mWood);
            bench.position.set(0, tY + 0.3, tZ + tDepth / 2);
            tGroup.add(bench);
        }
    }

    // Railing at front edge
    const frontZ = bD / 2 + 2 + terrLevels * stepD;
    const railFGeo = new THREE.BoxGeometry(terrW + 2, 1.1, 0.05);
    const railF = new THREE.Mesh(railFGeo, mSteel);
    railF.position.set(0, pillarH - terrLevels * stepH + 0.7, frontZ);
    tGroup.add(railF);

    // Side railings
    for (const side of [-1, 1]) {
        const sRailGeo = new THREE.BoxGeometry(0.05, 1.1, terrLevels * stepD + 4);
        const sRail = new THREE.Mesh(sRailGeo, mSteel);
        sRail.position.set(side * (terrW / 2 + 1), pillarH - 1, bD / 2 + 2 + terrLevels * stepD / 2);
        tGroup.add(sRail);
    }

    // DJ STAGE — elevated platform center of lowest terrace
    const stageY = pillarH - terrLevels * stepH + 0.2;
    const stageGeo = new THREE.BoxGeometry(8, 0.8, 5);
    const stage = new THREE.Mesh(stageGeo, mBlack);
    stage.position.set(0, stageY + 0.4, frontZ - 6);
    tGroup.add(stage);

    // DJ booth (small box on stage)
    const boothGeo = new THREE.BoxGeometry(3, 1.2, 1.5);
    const booth = new THREE.Mesh(boothGeo, mBlack);
    booth.position.set(0, stageY + 1.4, frontZ - 6);
    tGroup.add(booth);

    // Speaker stacks (2 sides)
    for (const side of [-1, 1]) {
        const spkGeo = new THREE.BoxGeometry(1.2, 2, 1);
        const spk = new THREE.Mesh(spkGeo, mBlack);
        spk.position.set(side * 5, stageY + 1.5, frontZ - 6);
        tGroup.add(spk);
    }

    // Stage canopy — fabric shade sail
    const canopyGeo = new THREE.PlaneGeometry(12, 8);
    const canopyMat = new THREE.MeshStandardMaterial({
        color: 0xCC2222, transparent: true, opacity: 0.7, side: THREE.DoubleSide
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, stageY + 4, frontZ - 6);
    canopy.rotation.x = -Math.PI / 2 + 0.15; // slight tilt
    tGroup.add(canopy);

    // Canopy support poles (4 corners)
    for (const sx of [-5.5, 5.5]) {
        for (const sz of [-3, 3]) {
            const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 4.5, 6);
            const pole = new THREE.Mesh(poleGeo, mSteel);
            pole.position.set(sx, stageY + 2.25, frontZ - 6 + sz);
            tGroup.add(pole);
        }
    }

    // String lights (festoon) across terrace
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xFFDD66, emissive: 0xFFAA22, emissiveIntensity: 0.5 });
    for (let row = 0; row < 3; row++) {
        const lz = bD / 2 + 4 + row * 5;
        for (let i = 0; i < 12; i++) {
            const lx = -terrW / 2 + 3 + i * (terrW - 6) / 11;
            const bulbGeo = new THREE.SphereGeometry(0.12, 6, 6);
            const bulb = new THREE.Mesh(bulbGeo, lightMat);
            bulb.position.set(lx, pillarH + 1.5 - row * 0.3, lz);
            tGroup.add(bulb);
        }
    }

    group.add(tGroup);

    // === LABELS ===
    group.add(bGroup);

    const labelSprite = makeTextSprite('Pardorama + Folie Douce\n1200м · Панорамний ресторан\n3 поверхи · 600+ місць · Après-ski тераса', {
        fontSize: 14, color: '#ffffff', bgColor: 'rgba(30,30,30,0.8)'
    });
    labelSprite.position.set(px, py + pillarH + totalH + roofH + 4, pz);
    group.add(labelSprite);

    // Info panel data
    bGroup.userData = {
        name: 'Pardorama + Folie Douce · 1200м',
        type: 'restaurant',
        info: [
            'Висота: 1200м',
            '── PARDORAMA ──',
            'Поверхи: 3 | Місткість: 600+ осіб',
            'Скляний фасад: 1000 м²',
            'Barrel-vault дах зі сталевими ребрами',
            '1F: Self-service (400 місць)',
            '2F: À la carte (120 місць)',
            '3F: Sky bar + конференц-зал (80 місць)',
            '',
            '── FOLIE DOUCE TERRACE ──',
            '4-рівнева каскадна тераса-амфітеатр',
            'DJ сцена з навісом та колонками',
            'Лавки на кожному рівні',
            'Гірляндне освітлення',
            'Панорама на Карпати',
            'Après-ski: 14:00–01:00',
            'Натхнення: La Folie Douce, Val Thorens',
        ].join('\n'),
    };

    scene.add(group);
    console.log('Pardorama + Folie Douce terrace placed at upper station (1200m)');
    return group;
}

// ============================================================
// SKI RUN — Легка синя №1 (120м) + corridor
// ============================================================
function buildSkiRun() {
    const group = new THREE.Group();
    group.name = 'Ski_Run_Blue1';

    // Run centerline from KMZ
    const runPts = [[-309.3,1346.4],[-301.4,1319.9],[-296.7,1305.7],[-287.2,1277.1],[-277.7,1248.5],[-268.2,1219.9],[-263.5,1205.6],[-254.0,1177.0],[-244.6,1148.3],[-239.8,1134.0],[-230.3,1105.4],[-220.9,1076.8],[-211.4,1048.2],[-206.6,1033.9],[-197.2,1005.3],[-187.7,976.7],[-182.9,962.4],[-173.5,933.8],[-164.0,905.2],[-154.5,876.5],[-149.8,862.2],[-140.3,833.6],[-130.8,805.0],[-126.1,790.7],[-116.6,762.1],[-107.1,733.5],[-97.6,704.9],[-92.9,690.6],[-83.4,662.0],[-74.0,633.4],[-69.2,619.0],[-59.7,590.4],[-50.3,561.8],[-40.8,533.2],[-36.0,518.9],[-26.6,490.3],[-17.1,461.7],[-12.3,447.4],[-2.9,418.8],[6.6,390.2],[16.1,361.5],[20.8,347.2],[30.3,318.6],[39.8,290.0],[44.5,275.7],[54.0,247.1],[63.5,218.5],[73.0,189.9],[77.7,175.6],[87.2,147.0],[96.6,118.4],[101.4,104.1],[110.9,75.4],[120.3,46.8],[129.8,18.2]];

    // Corridor outline from KMZ (closed polygon)
    const corridorPts = [[-350.3,1279.0],[-340.8,1250.3],[-331.3,1221.7],[-321.8,1193.1],[-317.1,1178.8],[-307.6,1150.2],[-298.1,1121.6],[-293.4,1107.3],[-283.9,1078.7],[-274.4,1050.1],[-265.0,1021.4],[-260.2,1007.1],[-250.8,978.5],[-241.3,949.9],[-236.5,935.6],[-227.1,907.0],[-217.6,878.4],[-208.1,849.8],[-203.4,835.5],[-193.9,806.9],[-184.4,778.3],[-179.7,763.9],[-170.2,735.3],[-160.7,706.7],[-151.2,678.1],[-146.5,663.8],[-137.0,635.2],[-127.5,606.6],[-122.8,592.3],[-113.3,563.7],[-103.8,535.1],[-94.4,506.4],[-89.6,492.1],[-80.2,463.5],[-70.7,434.9],[-65.9,420.6],[-56.5,392.0],[-47.0,363.4],[-37.5,334.8],[-32.8,320.5],[-23.3,291.9],[-13.8,263.3],[-9.1,249.0],[0.4,220.3],[9.9,191.7],[19.4,163.1],[24.1,148.8],[33.6,120.2],[43.1,91.6],[47.8,77.3],[57.3,48.7],[66.8,20.1],[76.2,-8.5],[183.4,45.0],[173.9,73.6],[164.5,102.2],[155.0,130.8],[150.2,145.1],[140.8,173.7],[131.3,202.3],[126.5,216.6],[117.1,245.3],[107.6,273.9],[98.1,302.5],[93.4,316.8],[83.9,345.4],[74.4,374.0],[69.7,388.3],[60.2,416.9],[50.7,445.5],[41.2,474.1],[36.5,488.5],[27.0,517.1],[17.6,545.7],[12.8,560.0],[3.3,588.6],[-6.1,617.2],[-15.6,645.8],[-20.4,660.1],[-29.8,688.7],[-39.3,717.3],[-44.1,731.6],[-53.5,760.3],[-63.0,788.9],[-72.5,817.5],[-77.2,831.8],[-86.7,860.4],[-96.2,889.0],[-100.9,903.3],[-110.4,931.9],[-119.9,960.5],[-129.4,989.1],[-134.1,1003.4],[-143.6,1032.1],[-153.0,1060.7],[-157.8,1075.0],[-167.3,1103.6],[-176.7,1132.2],[-186.2,1160.8],[-191.0,1175.1],[-200.4,1203.7],[-202.1,1225.2],[-204.0,1239.9],[-204.7,1265.9],[-205.1,1300.8],[-212.1,1325.9],[-215.5,1341.8],[-216.3,1361.7],[-367.3,1336.7],[-350.3,1279.0]];

    // ---- SKI RUN CENTERLINE (blue, on terrain) ----
    const linePoints = runPts.map(([x, ch]) => {
        const z = -ch;
        const y = sampleTerrainY(x, z);
        return new THREE.Vector3(x, y + 1.5, z);
    });

    // Smooth centerline with CatmullRom
    if (linePoints.length >= 4) {
        const curve = new THREE.CatmullRomCurve3(linePoints, false, 'centripetal', 0.3);
        const smoothPts = curve.getPoints(linePoints.length * 4);
        // Re-sample terrain Y for smooth points
        const finalLine = smoothPts.map(p => {
            const ty = sampleTerrainY(p.x, p.z);
            return new THREE.Vector3(p.x, ty + 1.5, p.z);
        });
        const lineGeo = new THREE.BufferGeometry().setFromPoints(finalLine);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x2266FF });
        group.add(new THREE.Line(lineGeo, lineMat));
    }

    // ---- CORRIDOR — dense grid mesh draped on terrain ----
    // Build left side and right side from corridor polygon
    const halfLen = Math.floor(corridorPts.length / 2);
    const leftSide = corridorPts.slice(0, halfLen);
    const rightSide = corridorPts.slice(halfLen).reverse();

    const numStrips = Math.min(leftSide.length, rightSide.length);
    const crossSteps = 5; // subdivide width into 5 strips for better terrain draping
    const corrVerts = [];
    const corrIndices = [];
    const stride = crossSteps + 1; // vertices per cross-section

    for (let i = 0; i < numStrips; i++) {
        const lx = leftSide[i][0], lch = leftSide[i][1];
        const rx = rightSide[i][0], rch = rightSide[i][1];
        // Interpolate across width
        for (let j = 0; j <= crossSteps; j++) {
            const t = j / crossSteps;
            const px = lx + (rx - lx) * t;
            const pch = lch + (rch - lch) * t;
            const pz = -pch;
            const py = sampleTerrainY(px, pz) + 2.0; // offset above terrain
            corrVerts.push(px, py, pz);
        }
    }

    // Build triangle indices
    for (let i = 0; i < numStrips - 1; i++) {
        for (let j = 0; j < crossSteps; j++) {
            const a = i * stride + j;
            const b = i * stride + j + 1;
            const c = (i + 1) * stride + j;
            const d = (i + 1) * stride + j + 1;
            corrIndices.push(a, b, c);
            corrIndices.push(b, d, c);
        }
    }

    const corrGeo = new THREE.BufferGeometry();
    corrGeo.setAttribute('position', new THREE.Float32BufferAttribute(corrVerts, 3));
    corrGeo.setIndex(corrIndices);
    corrGeo.computeVertexNormals();

    const corrMat = new THREE.MeshStandardMaterial({
        color: 0x4488FF,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
    });
    const corrMesh = new THREE.Mesh(corrGeo, corrMat);
    corrMesh.userData = {
        name: 'Легка синя №1 — коридор',
        type: 'ski-run',
        info: 'Ширина коридору: ~120м\nДовжина: ~1,340м\nПерепад: 280м (920→1200м)\nСкладність: синя (легка)\nФініш: дах паркінгу',
    };
    clickableObjects.push(corrMesh);
    group.add(corrMesh);

    // ---- CORRIDOR OUTLINE (on terrain) ----
    const outlinePts = corridorPts.map(([x, ch]) => {
        const z = -ch;
        const y = sampleTerrainY(x, z) + 1.0;
        return new THREE.Vector3(x, y, z);
    });
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePts);
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x0066FF, transparent: true, opacity: 0.7 });
    group.add(new THREE.Line(outlineGeo, outlineMat));

    // ---- LABELS ----
    const topLabel = new THREE.Mesh(
        new THREE.SphereGeometry(2, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x2266FF })
    );
    topLabel.position.copy(linePoints[0]);
    topLabel.position.y += 5;
    topLabel.userData = { name: 'Синя №1 — Старт (1040м)', type: 'ski-run' };
    clickableObjects.push(topLabel);
    group.add(topLabel);

    const botLabel = new THREE.Mesh(
        new THREE.SphereGeometry(2, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x2266FF })
    );
    botLabel.position.copy(linePoints[linePoints.length - 1]);
    botLabel.position.y += 5;
    botLabel.userData = { name: 'Синя №1 — Фініш (920м)', type: 'ski-run' };
    clickableObjects.push(botLabel);
    group.add(botLabel);

    scene.add(group);
    console.log('Ski run Blue №1 placed: 55 pts run + 110 pts corridor');
    return group;
}

// ============================================================
// MAYOT TOWER — Twisted Glass Tower (Хмарочос Карпат)
// ============================================================
function buildMAYOTTower(overrideX, overrideZ, label) {
    const TOWER_CH = 200;
    const TOWER_W_POS = 155;
    const tx = overrideX !== undefined ? overrideX : widthToX(TOWER_W_POS);
    const tz = overrideZ !== undefined ? overrideZ : chainageToZ(TOWER_CH);
    const baseElev = getElevationAt(tx, tz);
    let ty = baseElev - 855;
    // If on parking roof, elevate to roof level
    if (overrideX !== undefined) {
        const pkRoofY = sampleTerrainY(95, -50) + 7.4;
        ty = Math.max(ty, pkRoofY);
    }

    const group = new THREE.Group();
    group.name = label || 'MAYOT_Tower';
    const TW = 30, TD = 30, TWIST = 2.5;

    const floors = [
        { name:'1F Lobby', h:6.0, wf:1.15, df:1.10, type:'podium' },
        { name:'2F Hall', h:4.8, wf:1.12, df:1.08, type:'podium' },
        { name:'3F Asian+Kids', h:3.0, wf:1.08, df:1.05, type:'podium' },
        { name:'4F SPA', h:3.0, wf:1.0, df:1.0, type:'spa' },
        { name:'5F Pool', h:3.0, wf:1.0, df:1.0, type:'spa' },
        { name:'6F', h:3.0, wf:1.0, df:1.0, type:'res' },
        { name:'7F', h:3.0, wf:1.0, df:1.0, type:'res' },
        { name:'8F', h:3.0, wf:1.0, df:1.0, type:'res' },
        { name:'9F', h:3.0, wf:.98, df:.98, type:'res' },
        { name:'10F', h:3.0, wf:.98, df:.98, type:'res' },
        { name:'11F', h:3.0, wf:.97, df:.97, type:'res' },
        { name:'12F', h:3.0, wf:.97, df:.97, type:'res' },
        { name:'13F', h:3.0, wf:.96, df:.96, type:'res' },
        { name:'14F', h:3.0, wf:.96, df:.96, type:'res' },
        { name:'15F', h:3.0, wf:.95, df:.95, type:'res' },
        { name:'16F', h:3.0, wf:.95, df:.95, type:'res' },
        { name:'17F', h:3.0, wf:.94, df:.94, type:'res' },
        { name:'18F', h:3.0, wf:.94, df:.94, type:'res' },
        { name:'19F Dlx', h:3.0, wf:.92, df:.92, type:'deluxe' },
        { name:'20F Prm', h:3.0, wf:.90, df:.90, type:'premium' },
        { name:'21F Crown', h:4.0, wf:1.13, df:1.13, type:'crown' },
        { name:'Roof', h:3.5, wf:.55, df:.55, type:'roof' },
    ];

    const matGlass = new THREE.MeshStandardMaterial({ color:0x88BBCC, metalness:0.5, roughness:0.1, transparent:true, opacity:0.35, side:THREE.DoubleSide });
    const matSPA = new THREE.MeshStandardMaterial({ color:0x6BAED6, metalness:0.3, roughness:0.2, transparent:true, opacity:0.45, side:THREE.DoubleSide });
    const matSlab = new THREE.MeshStandardMaterial({ color:0xDDDDDD, roughness:0.7 });
    const matPodium = new THREE.MeshStandardMaterial({ color:0x8B7D6B, roughness:0.85 });
    const matCopper = new THREE.MeshStandardMaterial({ color:0xB87333, metalness:0.7, roughness:0.25 });
    const matTerrace = new THREE.MeshStandardMaterial({ color:0x9B8B7B, roughness:0.8 });
    const matRailing = new THREE.MeshStandardMaterial({ color:0xAABBCC, metalness:0.4, transparent:true, opacity:0.35 });
    const matRoof = new THREE.MeshStandardMaterial({ color:0x555555, metalness:0.3 });

    let fZ = 0, tw = 0, tCnt = 0;

    floors.forEach((f, fi) => {
        const fw = TW*f.wf, fd = TD*f.df;
        if (fi >= 5) tw += TWIST;
        const rad = tw*Math.PI/180;
        const cosA = Math.cos(rad), sinA = Math.sin(rad);
        const sx = fi>=5 ? Math.sin(tw*0.009)*1.2 : 0;
        const sz = fi>=5 ? Math.cos(tw*0.006)*0.8 : 0;

        // Slab
        const slabM = f.type==='podium'?matPodium : f.type==='crown'?matCopper : f.type==='roof'?matRoof : matSlab;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.35, fd), slabM);
        slab.position.set(sx, fZ+0.175, sz);
        slab.rotation.y = rad;
        slab.castShadow = true;
        slab.userData = { name:f.name, type:'mayot-tower', elevation:Math.round(baseElev+fZ)+'m' };
        clickableObjects.push(slab);
        group.add(slab);

        // Glass walls (4 sides)
        const gH = f.h-0.35;
        const gM = f.type==='spa'?matSPA : f.type==='crown'?matCopper : matGlass;
        const hw=fw/2, hd=fd/2;
        const corners = [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]];
        for (let si=0; si<4; si++) {
            const [x0,z0]=corners[si], [x1,z1]=corners[(si+1)%4];
            const rx0=x0*cosA-z0*sinA+sx, rz0=x0*sinA+z0*cosA+sz;
            const rx1=x1*cosA-z1*sinA+sx, rz1=x1*sinA+z1*cosA+sz;

            const nP = Math.max(4, Math.round(fw/3));
            for (let pi=0; pi<nP; pi++) {
                const t0=pi/nP, t1=(pi+1)/nP;
                const px0=rx0+(rx1-rx0)*t0, pz0=rz0+(rz1-rz0)*t0;
                const px1=rx0+(rx1-rx0)*t1, pz1=rz0+(rz1-rz0)*t1;
                const v = new Float32Array([px0,fZ+0.35,pz0, px1,fZ+0.35,pz1, px1,fZ+f.h,pz1, px0,fZ+0.35,pz0, px1,fZ+f.h,pz1, px0,fZ+f.h,pz0]);
                const pG = new THREE.BufferGeometry();
                pG.setAttribute('position', new THREE.BufferAttribute(v,3));
                pG.computeVertexNormals();
                group.add(new THREE.Mesh(pG, gM));
            }
            // Frame
            const fPts = [new THREE.Vector3(rx0,fZ+0.35,rz0), new THREE.Vector3(rx1,fZ+0.35,rz1),
                new THREE.Vector3(rx1,fZ+f.h,rz1), new THREE.Vector3(rx0,fZ+f.h,rz0), new THREE.Vector3(rx0,fZ+0.35,rz0)];
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fPts), new THREE.LineBasicMaterial({color:0x333333})));
        }

        // Terraces
        if (f.type==='res'||f.type==='deluxe'||f.type==='premium') {
            const sides = f.type==='premium'?[0,1,2,3]:[fi%4,(fi+2)%4];
            const tD = f.type==='premium'?3.5:f.type==='deluxe'?2.5:1.8;
            sides.forEach(side => {
                let tcx,tcz;
                if(side===0){tcx=0;tcz=hd+tD/2;}
                else if(side===1){tcx=hw+tD/2;tcz=0;}
                else if(side===2){tcx=0;tcz=-(hd+tD/2);}
                else{tcx=-(hw+tD/2);tcz=0;}
                const rtx=tcx*cosA-tcz*sinA+sx, rtz=tcx*sinA+tcz*cosA+sz;
                const tW=side%2===0?fw*0.5:tD, tL=side%2===0?tD:fd*0.5;
                const terr = new THREE.Mesh(new THREE.BoxGeometry(tW,0.3,tL), matTerrace);
                terr.position.set(rtx,fZ+0.15,rtz); terr.rotation.y=rad;
                terr.castShadow=true; group.add(terr);
                const rail = new THREE.Mesh(new THREE.BoxGeometry(tW,1.1,tL), matRailing);
                rail.position.set(rtx,fZ+0.85,rtz); rail.rotation.y=rad;
                group.add(rail);
                tCnt++;
            });
        }
        if(fi===1){const t=new THREE.Mesh(new THREE.BoxGeometry(28,0.3,8),matTerrace);t.position.set(sx,fZ+0.15,-hd-4+sz);group.add(t);tCnt++;}
        if(fi===2){const t=new THREE.Mesh(new THREE.BoxGeometry(5,0.3,20),matTerrace);t.position.set(hw+2.5+sx,fZ+0.15,sz);group.add(t);tCnt++;}

        fZ += f.h;
    });

    // Crown copper fins
    const crZ = floors.slice(0,20).reduce((s,f)=>s+f.h,0);
    const crRad = tw*Math.PI/180;
    for (let i=0;i<56;i++){
        const a=(i/56)*Math.PI*2+crRad;
        const r=TW*1.13/2+0.5;
        const fin=new THREE.Mesh(new THREE.BoxGeometry(0.04,5,0.5),matCopper);
        fin.position.set(Math.cos(a)*r,crZ+2.5,Math.sin(a)*r);
        fin.rotation.y=a; fin.castShadow=true; group.add(fin);
    }
    // Canopy
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(TW*1.2,0.25,TD*1.2),matCopper);
    canopy.position.y=crZ+4; canopy.rotation.y=crRad; canopy.castShadow=true; group.add(canopy);

    // Label
    const lbl = makeTextSprite(label || 'MAYOT TOWER\n~79m · 21F · 213 keys',{fontSize:16,color:'#FFD700',bgColor:'rgba(0,0,0,0.7)'});
    lbl.position.y=fZ+8;
    lbl.userData={name: label || 'MAYOT TOWER — Хмарочос Карпат', type:'mayot-tower', info:
`Condo-Hotel 5★ · Яремче · Карпати
═══════════════════════════════
📐 Формат: 21F + Roof (~95м), twist ${tw.toFixed(1)}°
📊 Keys: 213 (195 Std + 11 Dlx + 7 Prm)
📏 GBA indoor: ~25,800 м²
📏 Outdoor тераси: +2,917 м² (${tCnt} шт)
📏 Sellable: 10,010 м²
📏 Footprint: 900 м² (30×30м)
🏗️ Copper Crown 21F: 1,200 м²
═══════════════════════════════
ПОВЕРХИ:
• 21F — Sky Wellness Crown (ресторан, бар, infinity pool, сауна, клініка)
• 20F — Premium T-PH85 ×7 (85м², сауна 2×2, 2 спальні)
• 19F — Deluxe T-Dlx56 ×11 (56м², міні-сауна)
• 6-18F — Standard T-Std42 ×15/пов (42м², deep bath)
• 5F — Glass-Bottom Pool (18×7м, 28°C)
• 4F — SPA Duplex Thermal (каскади, Aufguss, сауни)
• 3F — Asian Restaurant + Cigar + Kids City
• 2F — Multi-function Hall (100 місць)
• 1F — Grand Lobby (камін, ресторан, бар, retail)
• Б1-Б2 — Паркінг 260 + BOH
═══════════════════════════════
💰 CAPEX: ~$59M | Revenue: ~$60M
💰 Target ADR: $220/ніч (з HB)
💰 Yield: 10.3% | Payback: 9.7 років
💰 Break-even ADR: $140/ніч (90% occ)
═══════════════════════════════
🏊 Водне дзеркало: 344м² (SPA 204 + Sky 140)
🍽️ F&B: 8 точок, 22 FTE
👥 Персонал: 62 FTE (0.29/key)
🅿️ Паркінг: 260 місць (2 підземних рівні)
🚿 7 ліфтів (5 guest + 1 VIP + 1 service)`
    };
    clickableObjects.push(lbl); group.add(lbl);

    group.position.set(tx,ty,tz);
    scene.add(group);
    console.log(`MAYOT Tower (Twisted Glass): ${fZ.toFixed(1)}m, twist ${tw.toFixed(1)}°, ${tCnt} terraces, pos: w=${TOWER_W_POS} ch=${TOWER_CH}`);
}

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
    scene.fog = new THREE.FogExp2(0x1a2a1a, 0.00015);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(-400, 600, 300);
    window.__camera = camera;

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
    controls.target.set(0, 150, -500);
    window.__controls = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 50;
    controls.maxDistance = 3000;

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
    dirLight.shadow.camera.far = 2500;
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

    // MAYOT Tower — Stage 2, трохи нижче ADLER Lodge (ch=260, правіше)
    const mt2x = widthToX(130);
    const mt2z = chainageToZ(260);
    buildMAYOTTower(mt2x, mt2z, 'MAYOT Tower · Stage 2');

    // MAYOT Tower #2 — on parking roof, SW corner
    // Parking: center (95, -50), size 105×60
    // SW corner: x = 95 - 105/2 + 15 = 42, z = -50 + 60/2 - 15 = -5
    // But that's the roof level, need to account for parking height
    const pk2X = 95 - 105/2 + 18;  // ~48 (left side)
    const pk2Z = -50 + 60/2 - 10;  // ~-10 (south side)
    buildMAYOTTower(pk2X, pk2Z, 'MAYOT Tower #2 (Parking)');

    // ADLER Lodge ALPE — center of site
    buildAdlerLodge();

    // AKI Family Resort — below ADLER
    buildAKIResort();

    // Ski lift: lower (920m) → upper (1200m) stations + cable
    buildSkiLift();

    // Ski run: Легка синя №1 (120м) + corridor
    buildSkiRun();

    // TechnoAlpin TR10 snow guns on towers
    buildSnowGuns();

    // Pardorama panoramic restaurant at upper station
    buildPardorama();
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

        // Color by elevation — Carpathian vegetation zones
        let r, g, b;
        if (elev < 920) {
            // Valley floor — dark rich earth/meadow
            const t = (elev - 860) / 60;
            r = 0.12 + t * 0.05;
            g = 0.22 + t * 0.08;
            b = 0.08 + t * 0.03;
        } else if (elev < 1000) {
            // Mixed forest zone — deep green
            const t = (elev - 920) / 80;
            r = 0.10 + t * 0.04;
            g = 0.25 + t * 0.05;
            b = 0.08 + t * 0.02;
        } else if (elev < 1100) {
            // Spruce forest — darker, cooler green
            const t = (elev - 1000) / 100;
            r = 0.10 + t * 0.03;
            g = 0.22 + t * 0.02;
            b = 0.09 + t * 0.03;
        } else if (elev < 1200) {
            // Treeline transition — brownish green (krummholz/polonyny)
            const t = (elev - 1100) / 100;
            r = 0.15 + t * 0.12;
            g = 0.22 + t * 0.03;
            b = 0.10 + t * 0.04;
        } else {
            // Alpine meadow (polonyna) — golden-brown grass
            const t = Math.min(1, (elev - 1200) / 100);
            r = 0.28 + t * 0.10;
            g = 0.26 + t * 0.05;
            b = 0.14 + t * 0.04;
        }

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
    const cols = elevData.grid.cols;
    const rows = elevData.grid.rows;
    const totalW = elevData.grid.width_m;
    const totalH = elevData.grid.height_m;
    const siteOffsetX = (elevData.bounds.site_min_lon - elevData.bounds.min_lon) * mPerDegLon;
    const siteOffsetZ = (elevData.bounds.site_min_lat - elevData.bounds.min_lat) * mPerDegLat;

    function gridToWorld(col, row) {
        return {
            x: col / (cols - 1) * totalW - siteOffsetX,
            z: -(row / (rows - 1) * totalH - siteOffsetZ)
        };
    }

    // Marching squares with segment chaining into polylines
    for (let elev = 870; elev <= 1250; elev += 10) {
        const y = elev - baseElev;

        // Collect all edge-crossing segments
        const allSegs = [];
        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
                const e00 = elevData.elevations[r][c] || 0;
                const e10 = elevData.elevations[r][c + 1] || 0;
                const e01 = elevData.elevations[r + 1]?.[c] || 0;
                const e11 = elevData.elevations[r + 1]?.[c + 1] || 0;
                if (!e00 || !e10 || !e01 || !e11) continue;

                const cp = [];
                // Bottom edge
                if ((e00 < elev) !== (e10 < elev)) {
                    const t = (elev - e00) / (e10 - e00);
                    const w = gridToWorld(c + t, r);
                    cp.push({ x: w.x, z: w.z, key: `h_${r}_${c}_${c+1}` });
                }
                // Top edge
                if ((e01 < elev) !== (e11 < elev)) {
                    const t = (elev - e01) / (e11 - e01);
                    const w = gridToWorld(c + t, r + 1);
                    cp.push({ x: w.x, z: w.z, key: `h_${r+1}_${c}_${c+1}` });
                }
                // Left edge
                if ((e00 < elev) !== (e01 < elev)) {
                    const t = (elev - e00) / (e01 - e00);
                    const w = gridToWorld(c, r + t);
                    cp.push({ x: w.x, z: w.z, key: `v_${c}_${r}_${r+1}` });
                }
                // Right edge
                if ((e10 < elev) !== (e11 < elev)) {
                    const t = (elev - e10) / (e11 - e10);
                    const w = gridToWorld(c + 1, r + t);
                    cp.push({ x: w.x, z: w.z, key: `v_${c+1}_${r}_${r+1}` });
                }
                if (cp.length >= 2) {
                    allSegs.push([cp[0], cp[1]]);
                    if (cp.length === 4) {
                        allSegs.push([cp[2], cp[3]]);
                    }
                }
            }
        }

        if (allSegs.length === 0) continue;

        // Chain segments into polylines by matching shared edge keys
        const edgeMap = new Map();
        for (const seg of allSegs) {
            for (const pt of seg) {
                if (!edgeMap.has(pt.key)) edgeMap.set(pt.key, []);
                edgeMap.get(pt.key).push(seg);
            }
        }

        const used = new Set();
        const chains = [];

        for (let si = 0; si < allSegs.length; si++) {
            if (used.has(si)) continue;
            used.add(si);
            const chain = [allSegs[si][0], allSegs[si][1]];

            // Extend forward
            let searching = true;
            while (searching) {
                searching = false;
                const lastKey = chain[chain.length - 1].key;
                const candidates = edgeMap.get(lastKey) || [];
                for (const seg of candidates) {
                    const idx = allSegs.indexOf(seg);
                    if (used.has(idx)) continue;
                    used.add(idx);
                    if (seg[0].key === lastKey) { chain.push(seg[1]); }
                    else { chain.push(seg[0]); }
                    searching = true;
                    break;
                }
            }
            // Extend backward
            searching = true;
            while (searching) {
                searching = false;
                const firstKey = chain[0].key;
                const candidates = edgeMap.get(firstKey) || [];
                for (const seg of candidates) {
                    const idx = allSegs.indexOf(seg);
                    if (used.has(idx)) continue;
                    used.add(idx);
                    if (seg[1].key === firstKey) { chain.unshift(seg[0]); }
                    else { chain.unshift(seg[1]); }
                    searching = true;
                    break;
                }
            }
            if (chain.length >= 3) chains.push(chain);
        }

        // Draw each chain as a smooth curve on terrain surface
        const isMajor = elev % 50 === 0;
        for (const chain of chains) {
            // Sample terrain Y for each point (stick to surface)
            const pts3d = chain.map(p => {
                const terrY = sampleTerrainY(p.x, p.z);
                return new THREE.Vector3(p.x, terrY + 0.8, p.z);
            });

            // Smooth with CatmullRom if enough points
            let finalPts;
            if (pts3d.length >= 4) {
                const curve = new THREE.CatmullRomCurve3(pts3d, false, 'centripetal', 0.3);
                finalPts = curve.getPoints(pts3d.length * 3);
            } else {
                finalPts = pts3d;
            }

            const geo = new THREE.BufferGeometry().setFromPoints(finalPts);
            const mat = new THREE.LineBasicMaterial({
                color: isMajor ? 0xD4C090 : 0x8A7A5A,
                transparent: true,
                opacity: isMajor ? 0.7 : 0.35,
            });
            const line = new THREE.Line(geo, mat);
            group.add(line);
        }

        // Label for major contours only
        if (isMajor && chains.length > 0) {
            const longest = chains.reduce((a, b) => a.length > b.length ? a : b);
            const midPt = longest[Math.floor(longest.length / 2)];
            const terrY = sampleTerrainY(midPt.x, midPt.z);
            const sprite = makeTextSprite(`${elev}м`, { fontSize: 12, color: '#D4C090', bgColor: 'rgba(0,0,0,0.4)' });
            sprite.position.set(midPt.x, terrY + 4, midPt.z);
            group.add(sprite);
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
// DIMENSION GRID OVERLAY
// ============================================================
function buildDimensionGrid() {
    const group = new THREE.Group();
    group.name = 'dimensionGrid';

    const gridY = 0.5; // slightly above terrain base
    const majorStep = 50;  // major grid every 50m
    const minorStep = 25;  // minor grid every 25m

    // Materials
    const majorMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.35 });
    const minorMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.15 });

    function gridLine(x1, z1, x2, z2, mat) {
        const y1 = sampleTerrainY(x1, z1) + 0.5;
        const y2 = sampleTerrainY(x2, z2) + 0.5;
        const pts = [new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        group.add(new THREE.Line(geo, mat));
    }

    // X grid lines (west to east) — along width
    for (let x = 0; x <= siteWidth; x += minorStep) {
        const isMajor = x % majorStep === 0;
        gridLine(x, 0, x, -siteHeight, isMajor ? majorMat : minorMat);

        // X dimension label at south edge
        if (isMajor) {
            const lbl = makeTextSprite(`${Math.round(x)}м`, { fontSize: 13, color: '#ffaa00', bgColor: 'rgba(0,0,0,0.6)' });
            lbl.position.set(x, sampleTerrainY(x, 5) + 3, 5);
            lbl.scale.set(12, 4, 1);
            group.add(lbl);
        }
    }

    // Z grid lines (south to north) — along height/chainage
    for (let ch = 0; ch <= 400; ch += (400 / siteHeight * minorStep)) {
        // Snap to nice numbers
        const chRound = Math.round(ch / 25) * 25;
        if (chRound > 400) break;
        const z = chainageToZ(chRound);
        const realM = Math.round(chRound / 400 * siteHeight);
        const isMajor = realM % majorStep < 5 || (majorStep - (realM % majorStep)) < 5;
        gridLine(0, z, siteWidth, z, isMajor ? majorMat : minorMat);

        // Z dimension label at west edge
        if (isMajor && realM > 0 && realM < siteHeight) {
            const lbl = makeTextSprite(`${realM}м`, { fontSize: 13, color: '#ffaa00', bgColor: 'rgba(0,0,0,0.6)' });
            lbl.position.set(-8, sampleTerrainY(2, z) + 3, z);
            lbl.scale.set(12, 4, 1);
            group.add(lbl);
        }
    }

    // ── SITE BOUNDARY DIMENSIONS ──
    // Total width label (south edge)
    const wLabel = makeTextSprite(`↔ ${Math.round(siteWidth)}м`, { fontSize: 15, color: '#ff8800', bgColor: 'rgba(0,0,0,0.7)' });
    wLabel.position.set(siteWidth / 2, sampleTerrainY(siteWidth / 2, 5) + 8, 8);
    wLabel.scale.set(18, 5, 1);
    group.add(wLabel);

    // Total height label (west edge)
    const hLabel = makeTextSprite(`↕ ${Math.round(siteHeight)}м`, { fontSize: 15, color: '#ff8800', bgColor: 'rgba(0,0,0,0.7)' });
    hLabel.position.set(-15, sampleTerrainY(2, -siteHeight / 2) + 8, -siteHeight / 2);
    hLabel.scale.set(18, 5, 1);
    group.add(hLabel);

    // ── BUILDING DIMENSION LABELS ──
    // Add size labels to each main building
    const buildingDims = [
        { name: 'S1A', ch: 348, x: null, w: 48, d: 14, h: '4F (14м)' },
        { name: 'S2 Lodge', ch: 260, x: null, w: 63, d: 13, h: '4F (13.2м)' },
        { name: 'S3 Main', ch: 135, x: null, w: 82, d: 21, h: '9F (29.7м)' },
    ];
    buildingDims.forEach(b => {
        const bounds = getSiteBounds(b.ch);
        const cx = (bounds.xMin + bounds.xMax) / 2;
        const z = chainageToZ(b.ch);
        const y = sampleTerrainY(cx, z);

        // Width × Depth label below building
        const dimLbl = makeTextSprite(`${b.name}: ${b.w}×${b.d}м, ${b.h}`, {
            fontSize: 12, color: '#ffcc44', bgColor: 'rgba(0,0,0,0.75)'
        });
        dimLbl.position.set(cx, y + 2, z + 18);
        dimLbl.scale.set(28, 5, 1);
        group.add(dimLbl);
    });

    // ── AMENITY DIMENSION LABELS ──
    const amenityDims = [
        { name: 'Water World', ch: 40, x: 68, w: 35, d: 22 },
        { name: 'Kids City', ch: 70, x: 114, w: 28, d: 14 },
        { name: 'Pavilion S3', ch: 76, x: 56, w: 28, d: 13 },
        { name: 'Onsen', ch: 330, x: null, w: 15, d: 14 },
        { name: 'Water Cascade', ch: 242, x: 44, w: 18, d: 12 },
    ];
    amenityDims.forEach(a => {
        const cx = a.x || ((getSiteBounds(a.ch).xMin + getSiteBounds(a.ch).xMax) / 2);
        const z = chainageToZ(a.ch);
        const y = sampleTerrainY(cx, z);
        const lbl = makeTextSprite(`${a.name}: ${a.w}×${a.d}м`, {
            fontSize: 11, color: '#88ccff', bgColor: 'rgba(0,0,0,0.65)'
        });
        lbl.position.set(cx, y + 2, z + 12);
        lbl.scale.set(24, 4, 1);
        group.add(lbl);
    });

    // ── AREA LABEL ──
    const areaLabel = makeTextSprite('S = 5.36 га (53,561 м²)', {
        fontSize: 16, color: '#ff8800', bgColor: 'rgba(0,0,0,0.8)'
    });
    areaLabel.position.set(siteWidth / 2, sampleTerrainY(siteWidth / 2, -siteHeight * 0.15) + 15, -siteHeight * 0.15);
    areaLabel.scale.set(30, 6, 1);
    group.add(areaLabel);

    return group;
}

// ============================================================
// BUILDINGS
// ============================================================
function buildAllBuildings() {
    const baseElev = 920 - 855; // Offset: terrain base is at 855, site starts at 920

    buildingGroups.s1a = buildStage1A(baseElev);
    // buildingGroups.s2 = buildStage2(baseElev);  // Stage 2 removed
    // buildingGroups.s3 = buildStage3(baseElev);  // Stage 3 removed

    scene.add(buildingGroups.s1a);
    // scene.add(buildingGroups.s2);
    // scene.add(buildingGroups.s3);

    // Dimension grid
    buildingGroups.dimGrid = buildDimensionGrid();
    scene.add(buildingGroups.dimGrid);

    // Entry gates at ch.200
    buildEntryGates(baseElev);
}

function sampleTerrainY(x, z) {
    // Sample real elevation from grid and convert to Three.js Y
    const elev = getElevationAt(x, z);
    return elev - 855;
}
window.sampleTerrainY = sampleTerrainY;

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
    const { name, x, z, width, depth, floors, floorH, color, stage, info, terraceDepth, cascadeOffset, doubleLoaded } = params;
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

        // ── NORTH face (-Z) — double-loaded: windows + terraces on both sides ──
        if (doubleLoaded) {
            // North window strip
            const winN = new THREE.Mesh(winGeo, winMat);
            winN.position.set(
                floorX + floorWidth / 2,
                baseY + f * floorH + floorH * 0.45,
                z - floorDepth - 0.05
            );
            group.add(winN);

            // North terrace
            if (terraceDepth && terraceDepth > 0) {
                const tNGeo = new THREE.BoxGeometry(floorWidth, 0.2, terraceDepth * 0.8);
                const tNMat = new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.8 });
                const terraceN = new THREE.Mesh(tNGeo, tNMat);
                terraceN.position.set(
                    floorX + floorWidth / 2,
                    baseY + f * floorH + 0.1,
                    z - floorDepth - terraceDepth * 0.4
                );
                terraceN.castShadow = true;
                group.add(terraceN);

                // North glass railing
                const railN = new THREE.Mesh(
                    new THREE.BoxGeometry(floorWidth, 1.1, 0.05),
                    new THREE.MeshPhysicalMaterial({ color: COLORS.glass, transparent: true, opacity: 0.3, roughness: 0.1 })
                );
                railN.position.set(
                    floorX + floorWidth / 2,
                    baseY + f * floorH + 0.6,
                    z - floorDepth - terraceDepth * 0.8
                );
                group.add(railN);
            }
        }
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
// Ritz-Carlton Nikko style: ONE unified luxury building + onsen terrace
// ============================================================
function buildStage1A(baseElev) {
    const group = new THREE.Group();
    group.name = 'Stage_1A';

    const b345 = getSiteBounds(345);
    const cx = (b345.xMin + b345.xMax) / 2;

    // ── MAIN BUILDING: 30 keys + integrated Lobby/F&B/SPA ──
    // Ritz-Carlton Nikko: single elegant structure on the ridge
    // GF: Lobby + F&B 250м² + SPA Indoor 80м²
    // F1-F3: 24× S42 + 6× M52 (M52 at corners)
    group.add(createBuilding({
        name: 'MAYOT SPA Retreat — Main Building',
        x: clampBuilding(cx - 24, 48, 348, 5), z: chainageToZ(348),
        width: 48, depth: 14,
        floors: 4, floorH: 3.5, color: COLORS.s1a,
        stage: 's1a', terraceDepth: 4, cascadeOffset: 1.0,
        info: {
            type: 'Main Building (Ritz-Carlton Nikko style)',
            keys: '30 (24× S42 Junior Suite + 6× M52 Master Suite)',
            floors: 'GF: Lobby + F&B 250м² + SPA Indoor 80м² | F1-F3: 10 suites/floor',
            s42: '42 м² net + 12 м² terrace × 24 = 1,094 м²',
            m52: '52 м² net + 18 м² terrace × 6 = 420 м²',
            total_sellable: '1,514 м²',
            features: 'Єдиний корпус, панорамне скло на південь, каскадні тераси',
            style: 'Japandi інтер\'єр, натуральні матеріали, 2700K'
        }
    }));

    // ── ONSEN DECK — outdoor thermal terrace south of main building ──
    group.add(createWaterFeature({
        name: 'Onsen Deck (термальний)',
        x: clampBuilding(cx - 7, 15, 330, 4), z: chainageToZ(330),
        width: 15, depth: 14,
        stage: 's1a',
        info: {
            type: 'Onsen Deck', area: '205 м²',
            components: 'Термальна чаша 60м² (39°C), cold plunge 8м² (10°C), фінська сауна 55м², deck 82м²',
            note: '18+ only'
        }
    }));

    // ── UNDERGROUND PARKING ──
    const parkGeo = new THREE.BoxGeometry(40, 3, 25);
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x333333, transparent: true, opacity: 0.4 });
    const parkMesh = new THREE.Mesh(parkGeo, parkMat);
    parkMesh.position.set(cx, sampleTerrainY(cx, chainageToZ(360)) - 5, chainageToZ(360));
    parkMesh.userData = { name: 'Підземний паркінг S1A', stage: 's1a', clickable: true, info: { type: 'Паркінг', spots: '40 місць', area: '924 м² GBA' } };
    clickableObjects.push(parkMesh);
    group.add(parkMesh);

    const label = makeTextSprite('STAGE 1A — SPA RETREAT', { fontSize: 18, color: '#2B5C3F', bgColor: 'rgba(0,0,0,0.7)' });
    label.position.set(cx, sampleTerrainY(cx, chainageToZ(370)) + 25, chainageToZ(370));
    label.scale.set(36, 9, 1);
    group.add(label);

    return group;
}

// ============================================================
// STAGE 2 — Mountain Lodge (ch.200-320, 48 keys)
// Adler Lodge Alpe style: ONE central lodge + chalets in forest
// ============================================================
function buildStage2(baseElev) {
    const group = new THREE.Group();

    // ── CENTRAL LODGE: 42 keys (36× Std40 + 6× Dlx50) ──
    // Adler Lodge Alpe: one main building — heart of the resort
    // GF: Lobby + Pavilion 360м² + SPA 400м²
    // F1-F3: 36× Std40 + 6× Dlx50 (corners)
    group.add(createBuilding({
        name: 'MAYOT Mountain Lodge — Main Building',
        x: clampBuilding(28, 63, 260, 5), z: chainageToZ(260),
        width: 63, depth: 13,
        floors: 4, floorH: 3.3, color: COLORS.s2,
        stage: 's2', terraceDepth: 3.5, cascadeOffset: 1.0,
        info: {
            type: 'Central Lodge (Adler Lodge Alpe style)',
            keys: '42 (36× Std40 + 6× Dlx50 corner suites)',
            floors: 'GF: Lobby + Pavilion 360м² + SPA 400м² | F1-F3: 14 rooms/floor',
            std40: '40 м² net + 10 м² terrace × 36 = 1,548 м²',
            dlx50: '50 м² net + 15 м² terrace × 6 = 327 м²',
            total_sellable: '1,875 м²',
            style: 'Alpine lodge, деревина + камінь, відкритий камін у лобі'
        }
    }));

    // ── WATER CASCADE — outdoor thermal south of lodge ──
    group.add(createWaterFeature({
        name: 'Water Cascade',
        x: clampBuilding(35, 18, 242, 5), z: chainageToZ(242),
        width: 18, depth: 12,
        stage: 's2',
        info: { type: 'Water Cascade', area: '280 м²', components: '3 чаші 36/38/40°C, каскадний перелив' }
    }));

    // ── 6 CHALETS scattered in forest around the lodge ──
    // Organic placement: each chalet surrounded by trees, 50-120m from lodge
    const chaletPositions = [
        { ch: 225, x: 105 },  // SE forest
        { ch: 230, x: 130 },  // far SE
        { ch: 252, x: 115 },  // east mid
        { ch: 258, x: 140 },  // far east
        { ch: 282, x: 110 },  // NE
        { ch: 240, x: 140 },  // west forest
    ];
    chaletPositions.forEach((pos, i) => {
        group.add(createBuilding({
            name: `Chalet80 #${i + 1}`,
            x: clampBuilding(pos.x, 10, pos.ch, 5), z: chainageToZ(pos.ch),
            width: 10, depth: 8, floors: 2, floorH: 3.5, color: COLORS.wood,
            stage: 's2', terraceDepth: 4, cascadeOffset: 0.3,
            info: {
                type: 'Chalet80 (standalone)',
                net: '80 м²', terrace: '30 м²', sellable: '89.0 м²',
                features: '2 спальні, кухня, 2 ванни, камін, приватна тераса',
                note: 'Окремий шале в лісі, лісова стежка до лоджу'
            }
        }));
    });

    // ── KIDS OUTDOOR — north of lodge ──
    group.add(createPavilion({
        name: 'Kids Outdoor S2',
        x: clampBuilding(95, 14, 310, 5), z: chainageToZ(310),
        width: 14, depth: 14, floors: 1,
        stage: 's2',
        info: { type: 'Kids Area S2', area: '192 м² outdoor + 80 м² indoor' }
    }));

    // ── UNDERGROUND PARKING ──
    const parkGeo = new THREE.BoxGeometry(42, 3, 30);
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x333333, transparent: true, opacity: 0.4 });
    const park2 = new THREE.Mesh(parkGeo, parkMat);
    park2.position.set(55, sampleTerrainY(55, chainageToZ(268)) - 5, chainageToZ(268));
    park2.userData = { name: 'Підземний паркінг S2', stage: 's2', clickable: true, info: { type: 'Паркінг', spots: '40 місць', area: '924 м² GBA' } };
    clickableObjects.push(park2);
    group.add(park2);

    const label = makeTextSprite('STAGE 2 — MOUNTAIN LODGE', { fontSize: 18, color: '#C4A882', bgColor: 'rgba(0,0,0,0.7)' });
    label.position.set(75, sampleTerrainY(75, chainageToZ(265)) + 25, chainageToZ(265));
    label.scale.set(40, 10, 1);
    group.add(label);

    return group;
}

// ============================================================
// STAGE 3 — Family Resort (ch.0-200, 135 keys)
// Mix: Bürgenstock (terraced wings) + Falkensteiner Lido (water)
// + Waldhotel (health/medical) + Adler Aki (family wings)
// ============================================================
function buildStage3(baseElev) {
    const group = new THREE.Group();

    // ═══ AMENITY CORE (ch.35-80) ═══

    // Water World — 1,500 м² (Falkensteiner Lido inspired)
    group.add(createWaterFeature({
        name: 'Water World (Falkensteiner Lido)',
        x: clampBuilding(50, 35, 40, 5), z: chainageToZ(40),
        width: 35, depth: 22,
        stage: 's3',
        info: {
            type: 'Water World', area: '1,500 м² (1,000 indoor + 500 outdoor)',
            components: 'Водна площа 280м², splash zone, baby zone, гарячі ванни',
            note: 'Найбільший водний атрактор Карпат'
        }
    }));

    // Kids City — 1,280 м² (Adler Aki inspired, north of Water World)
    group.add(createPavilion({
        name: 'Kids City (Adler Aki style)',
        x: clampBuilding(100, 28, 70, 5), z: chainageToZ(70),
        width: 28, depth: 14, floors: 2,
        stage: 's3',
        info: { type: 'Kids City', area: '1,280 м²', zones: '0-3, 3-6, 6-12 років', outdoor: 'Канатний парк, скеледром, petting farm' }
    }));

    // Main Pavilion S3 — 700 м²
    group.add(createPavilion({
        name: 'Main Pavilion S3 (Lobby + F&B)',
        x: clampBuilding(42, 28, 76, 5), z: chainageToZ(76),
        width: 28, depth: 13, floors: 2,
        stage: 's3',
        info: { type: 'Main Pavilion S3', area: '700 м²', functions: '6 F&B концептів, lobby, bar, lounge', kitchen: '169 м²' }
    }));

    // ═══ MAIN BUILDING — ONE resort complex, 135 keys ═══
    // Bürgenstock/Falkensteiner style: massive terraced building into hillside
    // 7 floors × ~20 rooms/floor, all room types integrated
    // GF: Health & Medical SPA 500м² + lobby extension
    // F1-F7: 105× Family50 + 18× XL65 + 12× Suite80
    group.add(createBuilding({
        name: 'MAYOT Family Resort — Main Building',
        x: clampBuilding(25, 82, 135, 5), z: chainageToZ(135),
        width: 82, depth: 21,
        floors: 9, floorH: 3.3, color: COLORS.s3,
        stage: 's3', terraceDepth: 4, cascadeOffset: 1.8, doubleLoaded: true,
        info: {
            type: 'Main Building (Bürgenstock/Falkensteiner/Waldhotel/Adler Aki mix)',
            keys: '135 (105× Family50 + 18× XL65 + 12× Suite80)',
            floors: 'GF: Health & Medical SPA 500м² + lobby | F1-F9: ~15 rooms/floor',
            family50: '50 м² net + 10 м² terrace × 105 = 6,300 м²',
            xl65: '65 м² net + 18 м² terrace × 18 = 1,494 м²',
            suite80: '80 м² net + 30 м² terrace × 12 = 1,320 м²',
            total_sellable: '9,114 м²',
            spa: 'Health & Medical SPA 500м² (GF) — 11 treatment rooms, infinity pool, 18+',
            style: 'Каскадна архітектура вбудована в схил, 7 терасних поверхів, панорама на південь'
        }
    }));

    // ═══ UNDERGROUND PARKING ═══
    const parkGeo = new THREE.BoxGeometry(60, 3, 40);
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x333333, transparent: true, opacity: 0.4 });
    const park3 = new THREE.Mesh(parkGeo, parkMat);
    park3.position.set(70, sampleTerrainY(70, chainageToZ(55)) - 5, chainageToZ(55));
    park3.userData = {
        name: 'Підземний паркінг S3', stage: 's3', clickable: true,
        info: { type: 'Паркінг', spots: '185 + 31 staff', area: '4,174 м² GBA', note: 'EV charger 19 точок' }
    };
    clickableObjects.push(park3);
    group.add(park3);

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

    // Tree generator — Carpathian conifers with altitude-based color gradient
    // Low (880-950m): rich dark green (buk/yalyna mix)
    // Mid (950-1050m): deep green spruce (smereky)
    // High (1050-1150m): lighter sparse spruce
    // Alpine (1150-1250m): stunted krummholz, grey-green
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4A2E14, roughness: 0.9 });

    // Run corridor check for ALL trees (not just forest)
    const _rlx = 129.8, _rlz = -18, _rux = -219.6, _ruz = -1294;
    const _rdx = _rux-_rlx, _rdz = _ruz-_rlz;
    const _rln = Math.sqrt(_rdx*_rdx+_rdz*_rdz);
    const _rnx = _rdx/_rln, _rnz = _rdz/_rln;

    // Exclusion zones for integrated complex
    const _parkX = 90, _parkZ = -55;      // parking/complex center
    const _svcX = 120, _svcZ = -85;       // services at roof level
    const _restX = 55, _restZ = -80;      // restaurant wing

    function addTree(x, z, scale = 1) {
        // Skip if on ski run (<50m from center)
        const tdx = x-_rlx, tdz = z-_rlz;
        const tAlong = tdx*_rnx+tdz*_rnz;
        if (tAlong > -20 && tAlong < _rln+20) {
            const tPerp = Math.abs(tdx*(-_rnz)+tdz*_rnx);
            if (tPerp < 55) return;
        }

        // Skip if inside parking zone (120×65m + 15m margin)
        if (Math.abs(x - _parkX) < 80 && Math.abs(z - _parkZ) < 50) return;
        // Skip if inside services zone (50×30m + margin)
        if (Math.abs(x - _svcX) < 30 && Math.abs(z - _svcZ) < 22) return;
        // Skip if inside restaurant zone (35×25m + margin)
        if (Math.abs(x - _restX) < 25 && Math.abs(z - _restZ) < 20) return;
        // Skip if near station (40m radius)
        const dsx = x - _rlx, dsz = z - _rlz;
        if (dsx*dsx + dsz*dsz < 40*40) return;
        // Skip entire integrated complex zone (parking + station + services)
        if (x > 30 && x < 155 && z > -100 && z < -10) return;

        const y = sampleTerrainY(x, z);
        const elev = y + 855;

        // Altitude-based color gradient
        let hue, sat, light;
        if (elev < 950) {
            // Low — rich dark green (mixed forest)
            hue = 0.30 + Math.random() * 0.05;
            sat = 0.55 + Math.random() * 0.1;
            light = 0.18 + Math.random() * 0.06;
        } else if (elev < 1050) {
            // Mid — deep green spruce
            hue = 0.32 + Math.random() * 0.04;
            sat = 0.45 + Math.random() * 0.1;
            light = 0.15 + Math.random() * 0.05;
        } else if (elev < 1150) {
            // High — lighter, sparser
            hue = 0.28 + Math.random() * 0.06;
            sat = 0.35 + Math.random() * 0.1;
            light = 0.22 + Math.random() * 0.06;
        } else {
            // Alpine krummholz — grey-green, small
            hue = 0.25 + Math.random() * 0.08;
            sat = 0.25 + Math.random() * 0.1;
            light = 0.28 + Math.random() * 0.08;
            scale *= 0.5; // stunted
        }

        // Trunk
        const trunkH = 2.5 * scale;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2 * scale, 0.4 * scale, trunkH, 5),
            trunkMat
        );
        trunk.position.set(x, y + trunkH / 2, z);
        trunk.castShadow = true;
        group.add(trunk);

        // Crown — double cone for more realistic spruce shape
        const crownColor = new THREE.Color().setHSL(hue, sat, light);
        const crownMat = new THREE.MeshStandardMaterial({ color: crownColor, roughness: 0.9 });

        // Lower wider cone
        const lowerH = 5 * scale;
        const lower = new THREE.Mesh(
            new THREE.ConeGeometry(2.8 * scale, lowerH, 6),
            crownMat
        );
        lower.position.set(x, y + trunkH + lowerH / 2 - 0.5 * scale, z);
        lower.castShadow = true;
        group.add(lower);

        // Upper narrower cone (tip)
        const upperH = 4 * scale;
        const upper = new THREE.Mesh(
            new THREE.ConeGeometry(1.6 * scale, upperH, 6),
            crownMat
        );
        upper.position.set(x, y + trunkH + lowerH + upperH / 2 - 1.5 * scale, z);
        upper.castShadow = true;
        group.add(upper);
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

    // ============================================================
    // EXTENDED FOREST — covers full terrain outside site & run
    // Terrain bounds: x ~ -475..336, z ~ -1474..204
    // Site: x ~ 0..186, z ~ 0..-421
    // Ski run corridor: ~100m wide strip from (130,-18) to (-220,-1294)
    // ============================================================

    // Helper: check if point is inside ski run corridor (100m wide)
    const runLX = 129.8, runLZ = -18;
    const runUX = -219.6, runUZ = -1294;
    const runDirX = runUX - runLX, runDirZ = runUZ - runLZ;
    const runLen = Math.sqrt(runDirX * runDirX + runDirZ * runDirZ);
    const runNX = runDirX / runLen, runNZ = runDirZ / runLen;

    function isInRunCorridor(px, pz, corridorWidth) {
        const dx = px - runLX, dz = pz - runLZ;
        const along = dx * runNX + dz * runNZ;
        if (along < -30 || along > runLen + 30) return false;
        const perp = Math.abs(dx * (-runNZ) + dz * runNX);
        // Organic edge: jagged treeline with noise
        const noise = Math.sin(along * 0.03) * 8 + Math.sin(along * 0.07) * 5;
        return perp < (corridorWidth / 2 + noise);
    }

    // Helper: check if point is inside site boundary (with organic edge)
    function isInSite(px, pz) {
        const noise = Math.sin(px * 0.05) * 5 + Math.sin(pz * 0.03) * 4;
        return px > (-5 + noise) && px < (195 + noise) && pz < (25 + noise) && pz > (-445 + noise);
    }

    // Generate dense Carpathian forest across entire terrain
    const terrainMinX = -450, terrainMaxX = 320;
    const terrainMinZ = -1450, terrainMaxZ = 180;
    const forestDensity = 12; // meters between trees (dense conifer forest)
    let forestCount = 0;

    // Use seeded random for consistency
    let seed = 12345;
    function seededRandom() {
        seed = (seed * 16807 + 0) % 2147483647;
        return (seed - 1) / 2147483646;
    }

    for (let fx = terrainMinX; fx < terrainMaxX; fx += forestDensity) {
        for (let fz = terrainMinZ; fz < terrainMaxZ; fz += forestDensity) {
            // Jitter position
            const tx = fx + (seededRandom() - 0.5) * forestDensity * 0.8;
            const tz = fz + (seededRandom() - 0.5) * forestDensity * 0.8;

            // Skip if inside site
            if (isInSite(tx, tz)) continue;

            // Skip if inside ski run corridor (140m wide — clear zone for grooming)
            if (isInRunCorridor(tx, tz, 140)) continue;

            // Skip if inside lift line corridor (30m wide)
            const liftDx = tx - 129.8, liftDz = tz - (-17);
            const liftAlong = liftDx * runNX + liftDz * runNZ;
            if (liftAlong > -20 && liftAlong < runLen + 20) {
                const liftPerp = Math.abs(liftDx * (-runNZ) + liftDz * runNX);
                if (liftPerp < 15) continue;
            }

            // Tree line: gradual thinning 1100-1200m, none above 1200m
            const elev = sampleTerrainY(tx, tz) + 855;
            if (elev > 1200) continue;

            // Gradual thinning near treeline (1100-1200m: increasingly sparse)
            if (elev > 1100) {
                const thinProb = (elev - 1100) / 100; // 0..1
                if (seededRandom() < thinProb * 0.7) continue;
            }

            // Vary scale with altitude (smaller trees higher up)
            const altFactor = 1.0 - Math.max(0, (elev - 950) / 250);
            const scale = (0.6 + seededRandom() * 0.5) * (0.4 + altFactor * 0.6);

            // Random skip for natural gaps and clearings
            if (seededRandom() < 0.12) continue;

            addTree(tx, tz, scale);
            forestCount++;
        }
    }

    console.log(`Forest: ${forestCount} trees (${forestDensity}m spacing, treeline at 1250m)`);
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

    // Toggle ALL labels (sprites)
    document.getElementById('toggleAllLabels').addEventListener('change', e => {
        const vis = e.target.checked;
        scene.traverse(obj => {
            if (obj.isSprite) obj.visible = vis;
        });
    });

    // Toggle objects by name
    function addObjToggle(id, nameMatch) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', e => {
                scene.traverse(obj => {
                    if (obj.name && obj.name.includes(nameMatch)) obj.visible = e.target.checked;
                });
            });
        }
    }
    addObjToggle('toggleS1A', 'Stage_1A');
    addObjToggle('toggleMAYOT1', 'MAYOT Tower · Stage 2');
    addObjToggle('toggleMAYOT2', 'MAYOT Tower #2');
    addObjToggle('toggleParking', 'Parking_Services');
    addObjToggle('toggleADLER', 'ADLER_Lodge');
    addObjToggle('toggleAKI', 'AKI_Resort');
    addObjToggle('toggleRun', 'Ski_Run');
    addObjToggle('toggleGuns', 'SnowGuns');
    addObjToggle('togglePardorama', 'Pardorama');

    // Lift toggle — includes Ski_Lift and Telemix
    const toggleLift = document.getElementById('toggleLift');
    if (toggleLift) {
        toggleLift.addEventListener('change', e => {
            scene.traverse(obj => {
                if (obj.name && (obj.name.includes('Ski_Lift') || obj.name.includes('Telemix'))) {
                    obj.visible = e.target.checked;
                }
            });
        });
    }

    // Parking toggle already handled by addObjToggle above

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

    document.getElementById('toggleDimGrid').addEventListener('change', e => {
        if (buildingGroups.dimGrid) buildingGroups.dimGrid.visible = e.target.checked;
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
        camera.position.set(-250, 300, 350);
        controls.target.set(siteWidth / 2, baseElev + 40, -siteHeight / 2);
    } else if (view === 's1a') {
        // Focus on MAYOT Tower Stage 2
        const tx = widthToX(130), tz = chainageToZ(260);
        const ty = sampleTerrainY(tx, tz);
        camera.position.set(tx + 80, ty + 100, tz + 80);
        controls.target.set(tx, ty + 30, tz);
    } else if (view === 'lift') {
        // Full lift + run view (from side)
        camera.position.set(-400, 500, -400);
        controls.target.set(-50, 200, -700);
    } else if (view === 'parking') {
        // Focus on parking + lower station
        const px = 95, pz = -50;
        const py = sampleTerrainY(px, pz);
        camera.position.set(px + 100, py + 80, pz + 100);
        controls.target.set(px, py + 10, pz);
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
