import { fetchRouteList, fetchDirections, fetchMapData, fetchVehicles } from './api.js';

const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/bright',
    center: [-79.4242, 43.6993],
    zoom: 11
});

let vehicleInterval = null;

map.on('load', async () => {
    map.loadImage(
    './assets/bus-icon-2.png',
    (error, image) => {
        if (error) throw error;
        map.addImage('bus-icon', image);
        }
    );
    map.loadImage(
    './assets/bus-arrow.png',
    (error, image) => {
        if (error) throw error;
        map.addImage('arrow-icon', image);
        }
    );

    // 1. Setup Layers
    setupMapLayers();

    // 2. Interactivity
    setupInteractions();

    // 3. UI
    await populateRouteSelect();
});

function setupMapLayers() {
    // Routes
    map.addSource('ttc-routes', { type: 'geojson', data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
        'id': 'routes-layer',
        'type': 'line',
        'source': 'ttc-routes',
        'layout': { 'line-join': 'round', 'line-cap': 'round' },
        'paint': {
            'line-color': ['case', ['has', 'route_color'], ['get', 'route_color'], "#d63031"],
            'line-width': 4,
            'line-opacity': 0.9
        }
    });

    // Stops
    map.addSource('ttc-stops', { type: 'geojson', data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
        'id': 'stops-layer',
        'type': 'circle',
        'source': 'ttc-stops',
        'paint': { 'circle-radius': 3, 'circle-color': '#fff', 'circle-stroke-color': '#2d3436', 'circle-stroke-width': 1.5 }
    });

    // Vehicles
    map.addSource('ttc-vehicles', { type: 'geojson', data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
        'id': 'vehicles-outline',
        'type': 'circle',
        'source': 'ttc-vehicles',
        'paint': { 'circle-radius': 22, 'circle-color': '#000'}
    });
    map.addLayer({
        'id': 'vehicles-layer',
        'type': 'symbol',       
        'source': 'ttc-vehicles',
        'layout': {
            'icon-image': 'bus-icon',
            'icon-size': 0.04,        
            'icon-allow-overlap': true,
            'icon-rotation-alignment': 'map'
        }
    });

    // Vehicle direction arrows
    map.addLayer({
        'id': 'vehicles-layer-dir',
        'type': 'symbol',       
        'source': 'ttc-vehicles',
        'layout': {
            'icon-image': 'arrow-icon',
            'icon-size': 0.4,        
            'icon-allow-overlap': false,
            'icon-rotate': ['get','arrow_bearing'],
            'icon-rotation-alignment': 'map',
            'icon-offset': [-62,0]
        }
    });
}

function setupInteractions() {
    map.on('click', 'stops-layer', (e) => {
        const coords = e.features[0].geometry.coordinates.slice();
        const props = e.features[0].properties;
        new maplibregl.Popup()
            .setLngLat(coords)
            .setHTML(`<strong>${props.stop_name}</strong><br>ID: ${props.stop_id}`)
            .addTo(map);
    });

    map.on('click', 'vehicles-layer', (e) => {
        const coords = e.features[0].geometry.coordinates.slice();
        const props = e.features[0].properties;
        new maplibregl.Popup()
            .setLngLat(coords)
            .setHTML(`<strong>Vehicle: ${props.vehicle_id}</strong>`)
            .addTo(map);
    });
    
    map.on('mouseenter', 'stops-layer', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'stops-layer', () => map.getCanvas().style.cursor = '');

    map.on('mouseenter', 'vehicles-layer', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'vehicles-layer', () => map.getCanvas().style.cursor = '');
}

async function populateRouteSelect() {
    try {
        const routes = await fetchRouteList();
        const routeSelect = document.getElementById('route-select');
        
        routes.forEach(route => {
            const option = document.createElement('option');
            option.value = route.route_id;
            option.textContent = `${route.route_id} - ${route.route_long_name}`;
            routeSelect.appendChild(option);
        });

        routeSelect.addEventListener('change', async (e) => {
            const routeId = e.target.value;
            const dirSelect = document.getElementById('dir-select');
            dirSelect.innerHTML = '<option value="">-- Select Direction --</option>';
            dirSelect.disabled = true;

            if (!routeId) {
                clearMap();
                return;
            }
            await populateDirectionSelect(routeId);
        });
    } catch (error) { console.error(error); }
}

async function populateDirectionSelect(routeId) {
    const directions = await fetchDirections(routeId);
    const dirSelect = document.getElementById('dir-select');
    
    directions.forEach(d => {
        const option = document.createElement('option');
        option.value = d.direction_id;
        option.textContent = d.trip_name;
        dirSelect.appendChild(option);
    });

    dirSelect.disabled = false;
    
    if (directions.length > 0) {
        dirSelect.value = directions[0].direction_id;
        updateMapData(routeId, directions[0].direction_id);
    }

    dirSelect.onchange = (e) => {
        if (e.target.value !== "") updateMapData(routeId, e.target.value);
    };
}

async function updateMapData(routeId, directionId) {
    if (!routeId || directionId === "") return;
    
    // 1. Load Static Data
    const data = await fetchMapData(routeId, directionId);
    map.getSource('ttc-routes').setData(data.routes);
    map.getSource('ttc-stops').setData(data.stops);
    
    fitMapBounds(data.stops);

    // 2. Start Live Polling
    if (vehicleInterval) clearInterval(vehicleInterval);
    
    const poll = async () => {
        const vehicles = await fetchVehicles(routeId);
        map.getSource('ttc-vehicles').setData(vehicles);
    };
    
    poll(); // Initial run
    vehicleInterval = setInterval(poll, 5000); // Repeat
}

function fitMapBounds(geoJsonData) {
    if (!geoJsonData.features.length) return;
    const bounds = new maplibregl.LngLatBounds();
    geoJsonData.features.forEach(f => {
        const [lon, lat] = f.geometry.coordinates;
        if (!isNaN(lon) && !isNaN(lat)) bounds.extend([lon, lat]);
    });
    map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
}

function clearMap() {
    const empty = { type: "FeatureCollection", features: [] };
    ['ttc-routes', 'ttc-stops', 'ttc-vehicles'].forEach(id => map.getSource(id).setData(empty));
    if (vehicleInterval) clearInterval(vehicleInterval);
}