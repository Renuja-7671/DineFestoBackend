const {
  evaluateWorkplaceVerification,
  parseDeviceLocation,
  buildCheckInLocationData,
} = require('./attendanceLocation.service');

describe('attendanceLocation.service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.WORKPLACE_LATITUDE = '6.9271';
    process.env.WORKPLACE_LONGITUDE = '79.8612';
    process.env.WORKPLACE_GEOFENCE_RADIUS_METERS = '150';
    process.env.ATTENDANCE_ENFORCE_GEOFENCE = 'true';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('parseDeviceLocation', () => {
    it('parses valid coordinates', () => {
      const result = parseDeviceLocation({ latitude: 6.9271, longitude: 79.8612, accuracy: 12 });
      expect(result).toEqual({
        latitude: 6.9271,
        longitude: 79.8612,
        accuracyMeters: 12,
      });
    });

    it('throws when coordinates are missing', () => {
      expect(() => parseDeviceLocation({})).toThrow('Device location is required');
    });
  });

  describe('evaluateWorkplaceVerification', () => {
    it('marks employee at workplace when within radius', () => {
      const result = evaluateWorkplaceVerification(6.9271, 79.8612);
      expect(result.atWorkplace).toBe(true);
      expect(result.distanceMeters).toBeLessThanOrEqual(150);
    });

    it('marks employee outside workplace when far away', () => {
      const result = evaluateWorkplaceVerification(7.5, 80.5);
      expect(result.atWorkplace).toBe(false);
      expect(result.distanceMeters).toBeGreaterThan(150);
    });

    it('accepts check-in when within any configured workplace site', () => {
      process.env.WORKPLACE_LATITUDE = '6.9271';
      process.env.WORKPLACE_LONGITUDE = '79.8612';
      process.env.WORKPLACE_LATITUDE_2 = '6.9500';
      process.env.WORKPLACE_LONGITUDE_2 = '79.9000';

      const farFromPrimary = evaluateWorkplaceVerification(6.9500, 79.9000);
      expect(farFromPrimary.atWorkplace).toBe(true);
      expect(farFromPrimary.matchedLocation).toBe('Location 2');
      expect(farFromPrimary.locationCount).toBe(2);
    });
  });

  describe('buildCheckInLocationData', () => {
    it('rejects punch when outside geofence and enforcement is on', () => {
      expect(() =>
        buildCheckInLocationData({ latitude: 7.5, longitude: 80.5 })
      ).toThrow('You must be at the workplace');
    });

    it('allows punch when inside geofence', () => {
      const result = buildCheckInLocationData({ latitude: 6.9271, longitude: 79.8612 });
      expect(result.checkInAtWorkplace).toBe(true);
      expect(result.checkInLatitude).toBe(6.9271);
    });
  });
});
