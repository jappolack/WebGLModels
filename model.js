import * as THREE from 'https://unpkg.com/three@0.179.1/build/three.module.js';

import { OrbitControls }
from 'https://unpkg.com/three@0.179.1/examples/jsm/controls/OrbitControls.js';

import { GLTFLoader }
from 'https://unpkg.com/three@0.179.1/examples/jsm/loaders/GLTFLoader.js';

import * as SkeletonUtils
from 'https://unpkg.com/three@0.179.1/examples/jsm/utils/SkeletonUtils.js';

import { RGBELoader }
from 'https://unpkg.com/three@0.179.1/examples/jsm/loaders/RGBELoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.set(0,10,20);

const renderer = new THREE.WebGLRenderer({
    antialias:true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

document.body.appendChild(renderer.domElement);

//
// Lights
//

const ambientLight =
new THREE.AmbientLight(0xffffff,2);

scene.add(ambientLight);

const directionalLight =
new THREE.DirectionalLight(0xffffff,2);

directionalLight.position.set(5,10,5);

scene.add(directionalLight);

//
// Ground
//

const groundGeometry = new THREE.PlaneGeometry(100, 100);

function loadGroundTextures()
{
    const textureLoader = new THREE.TextureLoader();
    const loadMap = (path, colorSpace = THREE.NoColorSpace)=>
    {
        const texture = textureLoader.load(path);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(12, 12);
        texture.colorSpace = colorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        return texture;
    };

    return {
        color: loadMap('./textures/leafy_grass_diff_1k.jpg', THREE.SRGBColorSpace),
        normal: loadMap('./textures/leafy_grass_nor_gl_1k.jpg'),
        ambientOcclusion: loadMap('./textures/leafy_grass_ao_1k.jpg'),
        roughness: loadMap('./textures/leafy_grass_rough_1k.jpg')
    };
}

function drawGround()
{
    const textures = loadGroundTextures();
    groundGeometry.setAttribute('uv2', groundGeometry.attributes.uv);

    const material = new THREE.MeshStandardMaterial({
        map: textures.color,
        normalMap: textures.normal,
        aoMap: textures.ambientOcclusion,
        roughnessMap: textures.roughness,
        aoMapIntensity: 1.1,
        roughness: 1
    });

    material.normalScale.set(0.55, 0.55);

    const ground = new THREE.Mesh(groundGeometry, material);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    return ground;
}

const ground = drawGround();

function loadSceneEnvironment()
{
    new RGBELoader().load(
        './textures/lenong_2_1k.hdr',
        (texture)=>
        {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = texture;
            scene.environment = texture;
            scene.environmentIntensity = 0.45;
        },
        undefined,
        (error)=> console.error('Failed to load scene environment:', error)
    );
}

loadSceneEnvironment();

//
// Loader
//

const loader = new GLTFLoader();

const obstacles = [];
const walkers = [];
const treeSwayers = [];
const stumpSeats = [];
const seatedPeople = [];
const animalTemplates = {};
const fireBaseScale = new THREE.Vector3();
let treeTemplate = null;
let manTemplate = null;
let womanTemplate = null;
let stumpTemplate = null;
let additionalTreesPlaced = false;
let campersPlaced = false;
let stumpsPlaced = false;
let seatedCampersPlaced = false;
let sleepingCampersPlaced = false;
let animalsPlaced = false;
let tentBounds = null;
let fireObject = null;
let fireLight = null;
let fireObstacleBounds = null;
let firePlaced = false;
let loadedEnvironmentObjects = 0;
let environmentReady = false;

function addObstacle(object)
{
    object.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(object);
    obstacles.push(bounds);
    return bounds;
}

function addSwayingTree(tree)
{
    const pivot = new THREE.Group();
    pivot.position.set(tree.position.x, 0, tree.position.z);
    tree.position.set(0, 0, 0);
    pivot.add(tree);
    scene.add(pivot);

    pivot.updateMatrixWorld(true);
    obstacles.push(new THREE.Box3().setFromObject(pivot));
    treeSwayers.push({
        pivot,
        phase: Math.random() * Math.PI * 2,
        amplitude: THREE.MathUtils.randFloat(0.012, 0.025),
        axis: Math.random() < 0.5 ? 'x' : 'z'
    });
}

function animateTrees()
{
    const time = clock.elapsedTime;

    treeSwayers.forEach((tree)=>
    {
        tree.pivot.rotation[tree.axis] = Math.sin(time * 0.8 + tree.phase) * tree.amplitude;
    });
}

function markEnvironmentLoaded()
{
    loadedEnvironmentObjects++;
    environmentReady = loadedEnvironmentObjects === 3;

    if (environmentReady)
    {
        addAdditionalTrees();
        addCampfireStumps();
        addCampers();
        addSeatedCampers();
        addSleepingCampers();
        addAnimals();
    }
}

function placeFireOutsideTent()
{
    if (!fireObject || !tentBounds || firePlaced)
    {
        return;
    }

    fireObject.updateMatrixWorld(true);
    const fireBounds = new THREE.Box3().setFromObject(fireObject);
    fireObject.position.x += tentBounds.max.x + 1 - fireBounds.min.x;
    fireObject.position.y -= fireBounds.min.y;
    fireObject.updateMatrixWorld(true);

    fireObstacleBounds = addObstacle(fireObject);
    fireBaseScale.copy(fireObject.scale);

    const fireCenter = fireObstacleBounds.getCenter(new THREE.Vector3());
    fireLight = new THREE.PointLight(0xff8a32, 5, 14, 2);
    fireLight.position.set(fireCenter.x, fireObstacleBounds.max.y - 0.2, fireCenter.z);
    scene.add(fireLight);

    firePlaced = true;
    markEnvironmentLoaded();
}

function addCampfireStumps()
{
    if (!environmentReady || !fireObject || !stumpTemplate || stumpsPlaced)
    {
        return;
    }

    stumpsPlaced = true;
    const fireBounds = new THREE.Box3().setFromObject(fireObject);
    const fireCenter = fireBounds.getCenter(new THREE.Vector3());
    const fireSize = fireBounds.getSize(new THREE.Vector3());
    const fireRadius = Math.max(fireSize.x, fireSize.z) / 2;
    const stumpTemplateScene = stumpTemplate.scene;
    const stumpScale = 0.16;
    const sampleStump = stumpTemplateScene.clone();
    sampleStump.scale.setScalar(stumpScale);
    sampleStump.updateMatrixWorld(true);

    const localBounds = new THREE.Box3().setFromObject(sampleStump);
    const localCenter = localBounds.getCenter(new THREE.Vector3());
    const stumpSize = localBounds.getSize(new THREE.Vector3());
    const stumpRadius = Math.max(stumpSize.x, stumpSize.z) / 2;

    for (let stumpIndex = 0; stumpIndex < 6; stumpIndex++)
    {
        const stump = stumpTemplateScene.clone();
        stump.scale.setScalar(stumpScale);
        let placed = false;

        for (let ring = 0; ring < 6 && !placed; ring++)
        {
            for (let angleOffset = -6; angleOffset <= 6; angleOffset++)
            {
                const angle = stumpIndex * Math.PI / 3 + angleOffset * Math.PI / 36;
                const radius = fireRadius + stumpRadius + 0.75 + ring * 1.25;
                const x = fireCenter.x + Math.cos(angle) * radius;
                const z = fireCenter.z + Math.sin(angle) * radius;

                stump.position.set(
                    x - localCenter.x,
                    -localBounds.min.y,
                    z - localCenter.z
                );
                stump.updateMatrixWorld(true);

                const stumpBounds = new THREE.Box3().setFromObject(stump);
                const insidePlane = stumpBounds.min.x > -49 && stumpBounds.max.x < 49 &&
                    stumpBounds.min.z > -49 && stumpBounds.max.z < 49;
                const overlapsObstacle = obstacles.some((obstacle)=>
                    boxesOverlapXZ(stumpBounds, obstacle, 0.35)
                );

                if (!insidePlane || overlapsObstacle)
                {
                    continue;
                }

                scene.add(stump);
                obstacles.push(stumpBounds);
                stumpSeats.push({
                    x,
                    y: stumpBounds.max.y,
                    z,
                    rotation: Math.atan2(fireCenter.x - x, fireCenter.z - z),
                    stumpRadius,
                    towardFireX: (fireCenter.x - x) / radius,
                    towardFireZ: (fireCenter.z - z) / radius
                });
                placed = true;
                break;
            }
        }

        if (!placed)
        {
            break;
        }
    }

    addSeatedCampers();
}

function animateCampfire(deltaTime)
{
    if (!fireObject)
    {
        return;
    }

    const time = clock.elapsedTime;
    const flicker = Math.sin(time * 17) * 0.55 + Math.sin(time * 29) * 0.3 + Math.sin(time * 43) * 0.15;
    fireObject.scale.y = fireBaseScale.y * (1 + flicker * 0.045);
    fireObject.rotation.y = Math.sin(time * 1.8) * 0.045;
    fireObject.updateMatrixWorld(true);

    const fireBounds = new THREE.Box3().setFromObject(fireObject);
    fireObject.position.y -= fireBounds.min.y;
    fireObject.updateMatrixWorld(true);

    if (fireObstacleBounds)
    {
        fireObstacleBounds.setFromObject(fireObject);
    }

    if (fireLight)
    {
        const center = fireBounds.getCenter(new THREE.Vector3());
        fireLight.position.set(center.x, fireBounds.max.y - 0.2, center.z);
        fireLight.intensity = 4.5 + flicker * 1.3;
    }
}

function getCharacterHeightForTent()
{
    if (!tentBounds)
    {
        return 1.7;
    }

    const tentSize = tentBounds.getSize(new THREE.Vector3());

    return Math.min(
        2,
        tentSize.y * 0.55
    );
}

function canMoveTo(walker, x, z)
{
    for (const obstacle of obstacles)
    {
        const nearestX = THREE.MathUtils.clamp(x, obstacle.min.x, obstacle.max.x);
        const nearestZ = THREE.MathUtils.clamp(z, obstacle.min.z, obstacle.max.z);
        const offsetX = x - nearestX;
        const offsetZ = z - nearestZ;

        if (offsetX * offsetX + offsetZ * offsetZ < walker.radius * walker.radius)
        {
            return false;
        }
    }

    for (const other of walkers)
    {
        if (other === walker)
        {
            continue;
        }

        const offsetX = x - other.character.position.x;
        const offsetZ = z - other.character.position.z;
        const minimumDistance = walker.radius + other.radius;

        if (offsetX * offsetX + offsetZ * offsetZ < minimumDistance * minimumDistance)
        {
            return false;
        }
    }

    return Math.abs(x) < 49 && Math.abs(z) < 49;
}

function findOpenWalkerPosition(radius, center = { x: 0, z: 0 }, range = 45)
{
    const candidate = { radius };
    const minX = Math.max(-45, center.x - range);
    const maxX = Math.min(45, center.x + range);
    const minZ = Math.max(-45, center.z - range);
    const maxZ = Math.min(45, center.z + range);

    for (let attempt = 0; attempt < 500; attempt++)
    {
        const x = THREE.MathUtils.randFloat(minX, maxX);
        const z = THREE.MathUtils.randFloat(minZ, maxZ);

        if (canMoveTo(candidate, x, z))
        {
            return { x, z };
        }
    }

    return null;
}

function boxesOverlapXZ(first, second, clearance)
{
    return first.min.x < second.max.x + clearance &&
        first.max.x + clearance > second.min.x &&
        first.min.z < second.max.z + clearance &&
        first.max.z + clearance > second.min.z;
}

function addAdditionalTrees()
{
    if (!treeTemplate || additionalTreesPlaced)
    {
        return;
    }

    additionalTreesPlaced = true;
    let placed = 0;

    for (let treeIndex = 0; treeIndex < 20; treeIndex++)
    {
        const tree = treeTemplate.clone();
        tree.scale.set(2,2,2);
        let treeBounds = null;

        for (let attempt = 0; attempt < 1000; attempt++)
        {
            tree.position.set(
                THREE.MathUtils.randFloat(-45, 45),
                0,
                THREE.MathUtils.randFloat(-45, 45)
            );
            tree.updateMatrixWorld(true);

            const candidateBounds = new THREE.Box3().setFromObject(tree);
            const withinPlane = candidateBounds.min.x > -49 &&
                candidateBounds.max.x < 49 &&
                candidateBounds.min.z > -49 &&
                candidateBounds.max.z < 49;
            const overlapsExisting = obstacles.some((obstacle)=>
                boxesOverlapXZ(candidateBounds, obstacle, 1.5)
            );

            if (withinPlane && !overlapsExisting)
            {
                treeBounds = candidateBounds;
                break;
            }
        }

        if (!treeBounds)
        {
            break;
        }

        addSwayingTree(tree);
        placed++;
    }

    console.info(`Added ${placed} of 20 additional trees without overlap.`);
}

function chooseWalkTarget(walker)
{
    const center = walker.roamCenter;
    const range = walker.roamRange;

    for (let attempt = 0; attempt < 20; attempt++)
    {
        const angle = Math.random() * Math.PI * 2;
        const minDistance = walker.targetMinDistance ?? 8;
        const maxDistance = walker.targetMaxDistance ?? 26;
        const distance = THREE.MathUtils.randFloat(minDistance, maxDistance);
        const x = THREE.MathUtils.clamp(
            walker.character.position.x + Math.cos(angle) * distance,
            Math.max(-46, center.x - range),
            Math.min(46, center.x + range)
        );
        const z = THREE.MathUtils.clamp(
            walker.character.position.z + Math.sin(angle) * distance,
            Math.max(-46, center.z - range),
            Math.min(46, center.z + range)
        );

        if (canMoveTo(walker, x, z))
        {
            walker.target.set(x, 0, z);
            return;
        }
    }

    walker.target.set(
        walker.character.position.x,
        0,
        walker.character.position.z
    );
}

function addWalker(gltf, isMoving, x = null, z = null, options = {})
{
    const character = gltf.scene;
    character.updateMatrixWorld(true);

    const originalBounds = new THREE.Box3().setFromObject(character);
    const originalHeight = originalBounds.getSize(new THREE.Vector3()).y;

    if (originalHeight > 0)
    {
        const targetHeight = options.height ?? getCharacterHeightForTent();
        character.scale.multiplyScalar(targetHeight / originalHeight);
    }

    character.position.set(0, 0, 0);
    character.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(character);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    character.position.set(-center.x, -bounds.min.y, -center.z);
    const radius = Math.max(size.x, size.z) * 0.35;
    const roamCenter = options.roamCenter ?? { x: 0, z: 0 };
    const roamRange = options.roamRange ?? 46;
    const openPosition = isMoving
        ? findOpenWalkerPosition(radius, roamCenter, options.spawnRange ?? 45)
        : { x, z };

    if (!openPosition)
    {
        return;
    }

    character.position.x += openPosition.x;
    character.position.z += openPosition.z;
    scene.add(character);

    const animationName = options.animationName ?? (isMoving ? 'walk' : 'idle');
    const animation = gltf.animations.find((clip)=>
        clip.name.toLowerCase().includes(animationName)
    );
    const mixer = new THREE.AnimationMixer(character);

    if (animation)
    {
        mixer.clipAction(animation).play();
    }

    const walker = {
        character,
        mixer,
        target: new THREE.Vector3(),
        radius,
        speed: options.speed ?? 1.4,
        isMoving,
        proceduralRun: options.proceduralRun ?? false,
        runPhase: Math.random() * Math.PI * 2,
        baseY: character.position.y,
        roamCenter,
        roamRange,
        targetMinDistance: options.targetMinDistance,
        targetMaxDistance: options.targetMaxDistance
    };

    walkers.push(walker);

    if (isMoving)
    {
        chooseWalkTarget(walker);
    }
}

function cloneWalkerTemplate(template)
{
    return {
        scene: SkeletonUtils.clone(template.scene),
        animations: template.animations
    };
}

function addCampers()
{
    if (!environmentReady || !manTemplate || !womanTemplate || !tentBounds || campersPlaced)
    {
        return;
    }

    campersPlaced = true;

    for (let index = 0; index < 6; index++)
    {
        addWalker(cloneWalkerTemplate(manTemplate), true);
    }

    for (let index = 0; index < 5; index++)
    {
        addWalker(cloneWalkerTemplate(womanTemplate), true);
    }
}

function addAnimals()
{
    if (!environmentReady || animalsPlaced ||
        !animalTemplates.deer || !animalTemplates.fox ||
        !animalTemplates.wolf || !animalTemplates.racoon)
    {
        return;
    }

    animalsPlaced = true;
    const animals = [
        { name: 'deer', count: 2, height: 1.55, speed: 3.1, animationName: 'gallop' },
        { name: 'fox', count: 2, height: 0.58, speed: 3.4, proceduralRun: true },
        { name: 'wolf', count: 2, height: 0.9, speed: 3.3, animationName: 'gallop' },
        { name: 'racoon', count: 2, height: 0.48, speed: 2.8, proceduralRun: true }
    ];

    animals.forEach((animal)=>
    {
        for (let index = 0; index < animal.count; index++)
        {
            addWalker(
                cloneWalkerTemplate(animalTemplates[animal.name]),
                true,
                null,
                null,
                {
                    ...animal,
                    roamCenter: { x: 0, z: 0 },
                    roamRange: 16,
                    spawnRange: 12,
                    targetMinDistance: 4,
                    targetMaxDistance: 10
                }
            );
        }
    });
}

function addBed(centerX, centerZ, width, length)
{
    const bed = new THREE.Group();
    bed.position.set(centerX, 0, centerZ);

    const wood = new THREE.MeshStandardMaterial({ color: 0x62462f });
    const mattress = new THREE.MeshStandardMaterial({ color: 0xb7c8c4 });
    const pillowMaterial = new THREE.MeshStandardMaterial({ color: 0xe4e8df });
    const blanket = new THREE.MeshStandardMaterial({ color: 0x526a60 });

    const addPart = (material, sizeX, sizeY, sizeZ, x, y, z)=>
    {
        const part = new THREE.Mesh(
            new THREE.BoxGeometry(sizeX, sizeY, sizeZ),
            material
        );
        part.position.set(x, y, z);
        bed.add(part);
    };

    const legHeight = 0.32;
    const frameHeight = 0.16;
    const mattressHeight = 0.24;
    const topY = legHeight + frameHeight + mattressHeight;

    for (const xSign of [-1, 1])
    {
        for (const zSign of [-1, 1])
        {
            addPart(
                wood,
                0.12,
                legHeight,
                0.12,
                xSign * (length / 2 - 0.12),
                legHeight / 2,
                zSign * (width / 2 - 0.12)
            );
        }
    }

    addPart(wood, length, frameHeight, width, 0, legHeight + frameHeight / 2, 0);
    addPart(mattress, length - 0.08, mattressHeight, width - 0.08, 0, legHeight + frameHeight + mattressHeight / 2, 0);
    addPart(pillowMaterial, 0.58, 0.14, width * 0.72, length * 0.34, topY + 0.07, 0);
    addPart(blanket, length * 0.48, 0.1, width * 0.94, -length * 0.18, topY + 0.04, 0);

    scene.add(bed);
    return { topY };
}

function addSleepingPerson(template, centerX, centerZ, bedWidth, bedLength, bedTop)
{
    const character = SkeletonUtils.clone(template.scene);
    character.updateMatrixWorld(true);

    const originalBounds = new THREE.Box3().setFromObject(character);
    const originalHeight = originalBounds.getSize(new THREE.Vector3()).y;
    const characterHeight = Math.min(getCharacterHeightForTent(), bedLength * 0.78);

    if (originalHeight > 0)
    {
        character.scale.multiplyScalar(characterHeight / originalHeight);
    }

    character.rotation.set(0, 0, -Math.PI / 2);

    const upperArmLeft = character.getObjectByName('UpperArm.L');
    const upperArmRight = character.getObjectByName('UpperArm.R');
    const lowerArmLeft = character.getObjectByName('LowerArm.L');
    const lowerArmRight = character.getObjectByName('LowerArm.R');
    const lowerLegLeft = character.getObjectByName('LowerLeg.L');
    const lowerLegRight = character.getObjectByName('LowerLeg.R');
    const head = character.getObjectByName('Head');

    if (upperArmLeft) upperArmLeft.rotation.z = -0.12;
    if (upperArmRight) upperArmRight.rotation.z = 0.12;
    if (lowerArmLeft) lowerArmLeft.rotation.z = -0.28;
    if (lowerArmRight) lowerArmRight.rotation.z = 0.28;
    if (lowerLegLeft) lowerLegLeft.rotation.z = 0.08;
    if (lowerLegRight) lowerLegRight.rotation.z = 0.08;
    if (head) head.rotation.z = -0.06;

    character.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(character);
    const center = bounds.getCenter(new THREE.Vector3());
    const bodyHeight = bounds.getSize(new THREE.Vector3()).y;
    character.position.set(
        centerX - center.x,
        bedTop - bounds.min.y + 0.015,
        centerZ - center.z
    );

    const bedFootprint = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(centerX, bedTop / 2, centerZ),
        new THREE.Vector3(bedLength, bedTop, bedWidth)
    );
    scene.add(character);

    return { character, bodyHeight, bedFootprint };
}

function addSleepingCampers()
{
    if (!environmentReady || !tentBounds || !manTemplate || !womanTemplate || sleepingCampersPlaced)
    {
        return;
    }

    sleepingCampersPlaced = true;
    const tentCenter = tentBounds.getCenter(new THREE.Vector3());
    const tentSize = tentBounds.getSize(new THREE.Vector3());
    const bedLength = Math.min(2.6, tentSize.x * 0.18);
    const bedWidth = Math.min(1.15, tentSize.x * 0.12, tentSize.z * 0.12);
    const availableBeds = [];
    const bedClearance = 0.55;
    const tentMargin = 0.8;

    for (let bedIndex = 0; bedIndex < 15; bedIndex++)
    {
        let position = null;

        for (let attempt = 0; attempt < 1000; attempt++)
        {
            const bedX = THREE.MathUtils.randFloat(
                tentBounds.min.x + bedLength / 2 + tentMargin,
                tentBounds.max.x - bedLength / 2 - tentMargin
            );
            const bedZ = THREE.MathUtils.randFloat(
                tentBounds.min.z + bedWidth / 2 + tentMargin,
                tentBounds.max.z - bedWidth / 2 - tentMargin
            );
            const footprint = new THREE.Box3().setFromCenterAndSize(
                new THREE.Vector3(bedX, 0, bedZ),
                new THREE.Vector3(bedLength + bedClearance, 1, bedWidth + bedClearance)
            );
            const overlapsBed = availableBeds.some((existingBed)=>
                boxesOverlapXZ(footprint, existingBed.footprint, 0)
            );

            if (!overlapsBed)
            {
                position = { bedX, bedZ, footprint };
                break;
            }
        }

        if (!position)
        {
            break;
        }

        const bed = addBed(position.bedX, position.bedZ, bedWidth, bedLength);
        availableBeds.push({ ...position, bed });
    }

    if (availableBeds.length < 15)
    {
        console.warn(`Placed ${availableBeds.length} of 15 beds without overlap.`);
    }

    for (let index = availableBeds.length - 1; index > 0; index--)
    {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [availableBeds[index], availableBeds[swapIndex]] =
            [availableBeds[swapIndex], availableBeds[index]];
    }

    availableBeds.slice(0, 5).forEach(({ bedX, bedZ, bed }, index)=>
    {
        const template = index % 2 === 0 ? manTemplate : womanTemplate;
        addSleepingPerson(template, bedX, bedZ, bedWidth, bedLength, bed.topY);
    });
}

function addSeatedPerson(template, seat, fireCenter)
{
    const character = SkeletonUtils.clone(template.scene);
    character.updateMatrixWorld(true);

    const originalBounds = new THREE.Box3().setFromObject(character);
    const originalHeight = originalBounds.getSize(new THREE.Vector3()).y;
    const characterHeight = getCharacterHeightForTent();

    if (originalHeight > 0)
    {
        character.scale.multiplyScalar(characterHeight / originalHeight);
    }

    character.position.set(0,0,0);
    character.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(character);
    const center = bounds.getCenter(new THREE.Vector3());
    const legClearance = Math.min(seat.stumpRadius * 0.6, characterHeight * 0.3);
    character.position.set(
        seat.x + seat.towardFireX * legClearance - center.x,
        Math.max(0, seat.y - characterHeight * 0.22 - bounds.min.y),
        seat.z + seat.towardFireZ * legClearance - center.z
    );
    character.rotation.y = Math.atan2(
        fireCenter.x - seat.x,
        fireCenter.z - seat.z
    );
    scene.add(character);

    const sittingClip = template.animations.find((clip)=>
        clip.name.toLowerCase().includes('sitting')
    );
    const clappingClip = template.animations.find((clip)=>
        clip.name.toLowerCase().includes('clapping')
    );
    const gesture = Math.random() < 0.5 ? 'clap' : 'wave';
    const mixer = new THREE.AnimationMixer(character);

    if (sittingClip)
    {
        mixer.clipAction(sittingClip).play();
    }

    let clapAction = null;

    if (clappingClip)
    {
        const upperBodyTracks = clappingClip.tracks.filter((track)=>
            /(Shoulder|UpperArm|LowerArm|Palm|Fingers|Thumb)/i.test(track.name)
        );
        const upperBodyClip = new THREE.AnimationClip(
            `${clappingClip.name}_UpperBody`,
            clappingClip.duration,
            upperBodyTracks
        );
        clapAction = mixer.clipAction(upperBodyClip);
        clapAction.setEffectiveWeight(gesture === 'clap' ? 1 : 0);
        clapAction.play();
    }

    const walker = {
        character,
        mixer,
        target: new THREE.Vector3(),
        radius: Math.max(characterHeight * 0.25, 0.35),
        speed: 0,
        isMoving: false
    };
    walkers.push(walker);

    seatedPeople.push({
        walker,
        clapAction,
        gesture,
        gestureDuration: THREE.MathUtils.randFloat(2, 5),
        wavePhase: Math.random() * Math.PI * 2,
        waveUpperArm: character.getObjectByName('UpperArm.R'),
        waveLowerArm: character.getObjectByName('LowerArm.R'),
        fireCenter
    });
}

function addSeatedCampers()
{
    if (!environmentReady || !stumpsPlaced || stumpSeats.length < 2 ||
        !manTemplate || !womanTemplate || seatedCampersPlaced)
    {
        return;
    }

    seatedCampersPlaced = true;
    const fireBounds = new THREE.Box3().setFromObject(fireObject);
    const fireCenter = fireBounds.getCenter(new THREE.Vector3());

    addSeatedPerson(manTemplate, stumpSeats[0], fireCenter);
    addSeatedPerson(womanTemplate, stumpSeats[1], fireCenter);
}

function updateSeatedGestures(deltaTime)
{
    seatedPeople.forEach((person)=>
    {
        person.gestureDuration -= deltaTime;

        if (person.gestureDuration <= 0)
        {
            person.gesture = Math.random() < 0.5 ? 'clap' : 'wave';
            person.gestureDuration = THREE.MathUtils.randFloat(2, 5);

            if (person.clapAction)
            {
                person.clapAction.setEffectiveWeight(person.gesture === 'clap' ? 1 : 0);
                person.clapAction.time = Math.random() * person.clapAction.getClip().duration;
            }
        }

        if (person.gesture !== 'wave')
        {
            return;
        }

        person.wavePhase += deltaTime * 7;

        if (person.waveUpperArm)
        {
            person.waveUpperArm.rotation.z += 0.9 + Math.sin(person.wavePhase) * 0.35;
            person.waveUpperArm.rotation.x += 0.2;
        }

        if (person.waveLowerArm)
        {
            person.waveLowerArm.rotation.z += 0.25 + Math.sin(person.wavePhase + 1) * 0.2;
        }
    });
}

function moveWalker(walker, deltaTime)
{
    if (!walker.isMoving)
    {
        return;
    }

    const character = walker.character;
    const offsetX = walker.target.x - character.position.x;
    const offsetZ = walker.target.z - character.position.z;
    const distance = Math.hypot(offsetX, offsetZ);

    if (distance < 0.3)
    {
        chooseWalkTarget(walker);
        return;
    }

    const stepDistance = Math.min(walker.speed * deltaTime, distance);
    const stepCount = Math.max(1, Math.ceil(stepDistance / Math.max(walker.radius * 0.4, 0.05)));
    const stepX = offsetX / distance * stepDistance / stepCount;
    const stepZ = offsetZ / distance * stepDistance / stepCount;

    for (let step = 0; step < stepCount; step++)
    {
        const nextX = character.position.x + stepX;
        const nextZ = character.position.z + stepZ;

        if (!canMoveTo(walker, nextX, nextZ))
        {
            chooseWalkTarget(walker);
            return;
        }

        character.position.x = nextX;
        character.position.z = nextZ;
    }

    character.rotation.y = Math.atan2(offsetX, offsetZ);

    if (walker.proceduralRun)
    {
        walker.runPhase += deltaTime * walker.speed * 5;
        character.position.y = walker.baseY + Math.abs(Math.sin(walker.runPhase)) * 0.08;
        character.rotation.z = Math.sin(walker.runPhase * 2) * 0.035;
    }
}

//
// Tree
//

loader.load(
    './models/tree.glb',
    (gltf)=>
    {
        treeTemplate = gltf.scene;
        const treePositions = [
            [-38,-32], [-19,-37], [6,-34], [34,-30], [-40,-5],
            [40,3], [-33,32], [-11,39], [18,35], [38,27]
        ];

        treePositions.forEach(([x,z])=>
        {
            const tree = gltf.scene.clone();

            tree.position.set(x,0,z);

            tree.scale.set(2,2,2);

            addSwayingTree(tree);
        });

        markEnvironmentLoaded();
    }
);

//
// Tent
//

loader.load(
    './models/tent.glb',
    (gltf)=>
    {
        const tent = gltf.scene;

        tent.position.set(0,0,0);

        tent.scale.setScalar(0.7);

        scene.add(tent);

        tent.updateMatrixWorld(true);
        tentBounds = new THREE.Box3().setFromObject(tent);
        const tentSize = tentBounds.getSize(new THREE.Vector3());
        const planeArea = groundGeometry.parameters.width * groundGeometry.parameters.height;
        const targetFootprintArea = planeArea / 32;
        const currentFootprintArea = tentSize.x * tentSize.z;

        if (currentFootprintArea > 0)
        {
            tent.scale.multiplyScalar(Math.sqrt(targetFootprintArea / currentFootprintArea));
            tent.updateMatrixWorld(true);
            tentBounds.setFromObject(tent);
        }

        const tentCenter = tentBounds.getCenter(new THREE.Vector3());
        tent.position.x -= tentCenter.x;
        tent.position.y -= tentBounds.min.y;
        tent.position.z -= tentCenter.z;

        tent.updateMatrixWorld(true);
        tentBounds.setFromObject(tent);
        obstacles.push(tentBounds);
        markEnvironmentLoaded();
        placeFireOutsideTent();
    }
);

//
// Campfire
//

loader.load(
    './models/campfire.glb',
    (gltf)=>
    {
        fireObject = gltf.scene;

        fireObject.position.set(0,0,0);

        fireObject.scale.set(1.5,1.5,1.5);
        fireBaseScale.copy(fireObject.scale);

        scene.add(fireObject);
        placeFireOutsideTent();
    }
);

loader.load(
    './models/stump.glb',
    (gltf)=>
    {
        stumpTemplate = gltf;
        addCampfireStumps();
    }
);

//
// Campers
//

loader.load(
    './models/man.glb',
    (gltf)=>
    {
        manTemplate = gltf;
        addCampers();
        addSeatedCampers();
        addSleepingCampers();
    }
);

loader.load(
    './models/woman.glb',
    (gltf)=>
    {
        womanTemplate = gltf;
        addCampers();
        addSeatedCampers();
        addSleepingCampers();
    }
);

loader.load('./models/deer.glb', (gltf)=>
{
    animalTemplates.deer = gltf;
    addAnimals();
});

loader.load('./models/fox.glb', (gltf)=>
{
    animalTemplates.fox = gltf;
    addAnimals();
});

loader.load('./models/wolf.glb', (gltf)=>
{
    animalTemplates.wolf = gltf;
    addAnimals();
});

loader.load('./models/racoon.glb', (gltf)=>
{
    animalTemplates.racoon = gltf;
    addAnimals();
});

//
// Orbit Controls
//

const controls =
new OrbitControls(
    camera,
    renderer.domElement
);

//
// Animation
//

function animate()
{
    requestAnimationFrame(animate);

    const deltaTime = Math.min(clock.getDelta(), 0.05);

    animateCampfire(deltaTime);
    animateTrees();

    walkers.forEach((walker)=>
    {
        walker.mixer.update(deltaTime);

        if (environmentReady)
        {
            moveWalker(walker, deltaTime);
        }
    });

    updateSeatedGestures(deltaTime);

    controls.update();

    renderer.render(
        scene,
        camera
    );
}

const clock = new THREE.Clock();

animate();

//
// Resize
//

window.addEventListener(
    'resize',
    ()=>
    {
        camera.aspect =
            window.innerWidth /
            window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );
    }
);