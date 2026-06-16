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

const getWorkplaceConfig = () => {
  const latitude = parseFloat(process.env.WORKPLACE_LATITUDE);
  const longitude = parseFloat(process.env.WORKPLACE_LONGITUDE);
  const radiusMeters = parseFloat(process.env.WORKPLACE_GEOFENCE_RADIUS_METERS || '150');

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    radiusMeters: Number.isFinite(radiusMeters) ? radiusMeters : 150,
  };
};

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
  const workplace = getWorkplaceConfig();

  if (!workplace) {
    return {
      workplaceConfigured: false,
      atWorkplace: null,
      distanceMeters: null,
      allowedRadiusMeters: null,
    };
  }

  const distanceMeters = haversineMeters(
    latitude,
    longitude,
    workplace.latitude,
    workplace.longitude
  );

  return {
    workplaceConfigured: true,
    atWorkplace: distanceMeters <= workplace.radiusMeters,
    distanceMeters: Math.round(distanceMeters * 10) / 10,
    allowedRadiusMeters: workplace.radiusMeters,
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
        `Current distance: ${verification.distanceMeters}m ` +
        `(allowed within ${verification.allowedRadiusMeters}m).`
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
  const workplace = getWorkplaceConfig();

  return {
    locationRequired: true,
    workplaceConfigured: Boolean(workplace),
    enforceGeofence: process.env.ATTENDANCE_ENFORCE_GEOFENCE !== 'false',
    allowedRadiusMeters: workplace?.radiusMeters ?? null,
  };
};

module.exports = {
  parseDeviceLocation,
  evaluateWorkplaceVerification,
  buildCheckInLocationData,
  buildCheckOutLocationData,
  getAttendanceLocationPolicy,
  getWorkplaceConfig,
};
