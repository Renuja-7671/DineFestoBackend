const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getRadiusMeters = () => {
  const radiusMeters = parseFloat(process.env.WORKPLACE_GEOFENCE_RADIUS_METERS || '150');
  return Number.isFinite(radiusMeters) ? radiusMeters : 150;
};

const parseCoordinatePair = (latitudeValue, longitudeValue) => {
  const latitude = parseFloat(latitudeValue);
  const longitude = parseFloat(longitudeValue);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
};

const getWorkplaceLocations = () => {
  const radiusMeters = getRadiusMeters();
  const locations = [];
  const seen = new Set();

  const addLocation = (latitude, longitude, label) => {
    const key = `${latitude},${longitude}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    locations.push({ latitude, longitude, radiusMeters, label });
  };

  const locationsEnv = process.env.WORKPLACE_LOCATIONS?.trim();
  if (locationsEnv) {
    locationsEnv.split(';').forEach((entry, index) => {
      const [lat, lng] = entry.split(',').map((part) => part.trim());
      const pair = parseCoordinatePair(lat, lng);
      if (pair) {
        addLocation(pair.latitude, pair.longitude, `Location ${index + 1}`);
      }
    });

    if (locations.length > 0) {
      return locations;
    }
  }

  const primary = parseCoordinatePair(
    process.env.WORKPLACE_LATITUDE,
    process.env.WORKPLACE_LONGITUDE
  );
  if (primary) {
    addLocation(primary.latitude, primary.longitude, 'Location 1');
  }

  for (let index = 2; index <= 10; index += 1) {
    const pair = parseCoordinatePair(
      process.env[`WORKPLACE_LATITUDE_${index}`],
      process.env[`WORKPLACE_LONGITUDE_${index}`]
    );
    if (pair) {
      addLocation(pair.latitude, pair.longitude, `Location ${index}`);
    }
  }

  return locations;
};

const getWorkplaceConfig = () => getWorkplaceLocations()[0] ?? null;

const parseDeviceLocation = (body = {}) => {
  const latitude = parseFloat(body.latitude);
  const longitude = parseFloat(body.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Device location is required for attendance punching');
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('Invalid GPS coordinates received from device');
  }

  const accuracy = body.accuracy != null ? parseFloat(body.accuracy) : null;

  return {
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracy) ? accuracy : null,
  };
};

const evaluateWorkplaceVerification = (latitude, longitude) => {
  const locations = getWorkplaceLocations();

  if (locations.length === 0) {
    return {
      workplaceConfigured: false,
      atWorkplace: null,
      distanceMeters: null,
      allowedRadiusMeters: null,
      matchedLocation: null,
      locationCount: 0,
    };
  }

  let closestDistance = Infinity;
  let matchedLocation = null;

  locations.forEach((workplace) => {
    const distanceMeters = haversineMeters(
      latitude,
      longitude,
      workplace.latitude,
      workplace.longitude
    );

    if (distanceMeters < closestDistance) {
      closestDistance = distanceMeters;
    }

    if (distanceMeters <= workplace.radiusMeters && !matchedLocation) {
      matchedLocation = workplace;
    }
  });

  return {
    workplaceConfigured: true,
    atWorkplace: matchedLocation !== null,
    distanceMeters: Math.round(closestDistance * 10) / 10,
    allowedRadiusMeters: locations[0].radiusMeters,
    matchedLocation: matchedLocation?.label ?? null,
    locationCount: locations.length,
  };
};

const assertLocationAllowed = (verification) => {
  if (!verification.workplaceConfigured) {
    return;
  }

  const enforceGeofence = process.env.ATTENDANCE_ENFORCE_GEOFENCE !== 'false';
  if (enforceGeofence && verification.atWorkplace === false) {
    throw new Error(
      `You must be at the workplace to punch attendance. ` +
        `Closest distance: ${verification.distanceMeters}m ` +
        `(allowed within ${verification.allowedRadiusMeters}m of a registered site).`
    );
  }
};

const buildCheckInLocationData = (body) => {
  const location = parseDeviceLocation(body);
  const verification = evaluateWorkplaceVerification(location.latitude, location.longitude);
  assertLocationAllowed(verification);

  return {
    checkInLatitude: location.latitude,
    checkInLongitude: location.longitude,
    checkInAccuracyMeters: location.accuracyMeters,
    checkInAtWorkplace: verification.atWorkplace,
    checkInDistanceMeters: verification.distanceMeters,
    verification,
  };
};

const buildCheckOutLocationData = (body) => {
  const location = parseDeviceLocation(body);
  const verification = evaluateWorkplaceVerification(location.latitude, location.longitude);
  assertLocationAllowed(verification);

  return {
    checkOutLatitude: location.latitude,
    checkOutLongitude: location.longitude,
    checkOutAccuracyMeters: location.accuracyMeters,
    checkOutAtWorkplace: verification.atWorkplace,
    checkOutDistanceMeters: verification.distanceMeters,
    verification,
  };
};

const getAttendanceLocationPolicy = () => {
  const locations = getWorkplaceLocations();

  return {
    locationRequired: true,
    workplaceConfigured: locations.length > 0,
    locationCount: locations.length,
    enforceGeofence: process.env.ATTENDANCE_ENFORCE_GEOFENCE !== 'false',
    allowedRadiusMeters: locations[0]?.radiusMeters ?? null,
  };
};

module.exports = {
  parseDeviceLocation,
  evaluateWorkplaceVerification,
  buildCheckInLocationData,
  buildCheckOutLocationData,
  getAttendanceLocationPolicy,
  getWorkplaceConfig,
  getWorkplaceLocations,
};
