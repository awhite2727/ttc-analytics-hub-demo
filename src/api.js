export async function fetchRouteList() {
    return fetch("data/route_list.json").then(r => r.json());
}

export async function fetchDirections(routeId) {
    return fetch(`data/directions/${routeId}.json`).then(r => r.json());
}

export async function fetchMapData(routeId, directionId) {
    const routes = await fetch(`data/map/${routeId}-${directionId}-routes.json`).then(r => r.json());
    const stops  = await fetch(`data/map/${routeId}-${directionId}-stops.json`).then(r => r.json());
    return { routes, stops };
}

export async function fetchVehicles(routeId) {
    return fetch(`data/vehicles/${routeId}.json`).then(r => r.json());
}
