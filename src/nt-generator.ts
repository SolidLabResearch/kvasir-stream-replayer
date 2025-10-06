import { createWriteStream } from 'fs';

export interface SensorDataConfig {
  sensorId: string;
  propertyType: string;
  dataType: string;
  valueRange: { min: number; max: number };
  intervalSeconds: number;
  noiseLevel: number; // 0-1, amount of random variation
}

export class NTDataGenerator {
  private sensors: SensorDataConfig[] = [
    {
      sensorId: 'http://example.org/TemperatureSensor1',
      propertyType: 'https://saref.etsi.org/core/Temperature',
      dataType: 'http://www.w3.org/2001/XMLSchema#float',
      valueRange: { min: 18.0, max: 28.0 },
      intervalSeconds: 300, // 5 minutes
      noiseLevel: 0.1
    },
    {
      sensorId: 'http://example.org/HumiditySensor1',
      propertyType: 'https://saref.etsi.org/core/Humidity',
      dataType: 'http://www.w3.org/2001/XMLSchema#float',
      valueRange: { min: 30.0, max: 80.0 },
      intervalSeconds: 300, // 5 minutes
      noiseLevel: 0.15
    },
    {
      sensorId: 'http://example.org/PressureSensor1',
      propertyType: 'http://example.org/AtmosphericPressure',
      dataType: 'http://www.w3.org/2001/XMLSchema#float',
      valueRange: { min: 980.0, max: 1030.0 },
      intervalSeconds: 600, // 10 minutes
      noiseLevel: 0.05
    },
    {
      sensorId: 'http://example.org/LightSensor1',
      propertyType: 'http://example.org/LuminousIntensity',
      dataType: 'http://www.w3.org/2001/XMLSchema#integer',
      valueRange: { min: 0, max: 1000 },
      intervalSeconds: 180, // 3 minutes
      noiseLevel: 0.2
    }
  ];

  /**
   * Generate NT file with synthetic sensor data
   */
  generateNTFile(
    filePath: string,
    startTime: Date,
    durationHours: number,
    customSensors?: SensorDataConfig[]
  ): void {
    const sensors = customSensors || this.sensors;
    const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);
    
    console.log(`Generating NT file: ${filePath}`);
    console.log(`Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
    console.log(`${sensors.length} sensors, ${durationHours} hours of data`);
    
    const stream = createWriteStream(filePath);
    let measurementCount = 0;
    
    // Write header comment
    stream.write(`# Generated timeseries data for Kvasir replayer testing\n`);
    stream.write(`# Start: ${startTime.toISOString()}\n`);
    stream.write(`# End: ${endTime.toISOString()}\n`);
    stream.write(`# Duration: ${durationHours} hours\n`);
    stream.write(`# Sensors: ${sensors.length}\n`);
    stream.write(`\n`);
    
    // Generate data for each sensor
    for (const sensor of sensors) {
      console.log(`   Generating data for ${sensor.sensorId.split('/').pop()}`);
      
      let currentTime = new Date(startTime);
      let lastValue = (sensor.valueRange.min + sensor.valueRange.max) / 2;
      
      while (currentTime <= endTime) {
        measurementCount++;
        const measurementId = `http://example.org/Measurement_${sensor.sensorId.split('/').pop()}_${measurementCount}`;
        
        // Generate realistic value with trend and noise
        const timeProgress = (currentTime.getTime() - startTime.getTime()) / (endTime.getTime() - startTime.getTime());
        const trendValue = this.generateTrendValue(sensor, timeProgress);
        const noisyValue = this.addNoise(trendValue, sensor.noiseLevel, sensor.valueRange);
        
        lastValue = noisyValue;
        
        // Write measurement triples
        this.writeNTTriples(stream, measurementId, sensor, currentTime, noisyValue);
        
        // Advance time
        currentTime = new Date(currentTime.getTime() + sensor.intervalSeconds * 1000);
      }
    }
    
    stream.end();
    
    console.log(`Generated ${measurementCount} measurements in ${filePath}`);
    console.log(`Average: ${(measurementCount / durationHours).toFixed(1)} measurements/hour`);
  }

  /**
   * Generate a quick test NT file (30 minutes of data)
   */
  generateTestFile(filePath: string): void {
    const now = new Date();
    const startTime = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago
    
    this.generateNTFile(filePath, startTime, 0.5); // 30 minutes
  }

  /**
   * Generate a large NT file for performance testing (multiple hours)
   */
  generateLargeTestFile(filePath: string, hours: number = 3): void {
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
    
    // Add more sensors for larger dataset
    const largeSensorSet: SensorDataConfig[] = [
      ...this.sensors,
      // Add more temperature sensors
      {
        sensorId: 'http://example.org/TemperatureSensor2',
        propertyType: 'https://saref.etsi.org/core/Temperature',
        dataType: 'http://www.w3.org/2001/XMLSchema#float',
        valueRange: { min: 15.0, max: 25.0 },
        intervalSeconds: 120, // 2 minutes
        noiseLevel: 0.08
      },
      {
        sensorId: 'http://example.org/TemperatureSensor3',
        propertyType: 'https://saref.etsi.org/core/Temperature',
        dataType: 'http://www.w3.org/2001/XMLSchema#float',
        valueRange: { min: 20.0, max: 30.0 },
        intervalSeconds: 180, // 3 minutes
        noiseLevel: 0.12
      },
      // Add energy sensor
      {
        sensorId: 'http://example.org/EnergySensor1',
        propertyType: 'http://example.org/EnergyConsumption',
        dataType: 'http://www.w3.org/2001/XMLSchema#float',
        valueRange: { min: 0.5, max: 5.0 },
        intervalSeconds: 60, // 1 minute
        noiseLevel: 0.25
      }
    ];
    
    this.generateNTFile(filePath, startTime, hours, largeSensorSet);
  }

  private writeNTTriples(
    stream: NodeJS.WritableStream,
    measurementId: string,
    sensor: SensorDataConfig,
    timestamp: Date,
    value: number
  ): void {
    // Type triple
    stream.write(`<${measurementId}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://saref.etsi.org/core/Measurement> .\n`);
    
    // Value triple
    const formattedValue = sensor.dataType.includes('integer') ? 
      Math.round(value).toString() : 
      value.toFixed(2);
    stream.write(`<${measurementId}> <https://saref.etsi.org/core/hasValue> "${formattedValue}"^^<${sensor.dataType}> .\n`);
    
    // Timestamp triple
    stream.write(`<${measurementId}> <https://saref.etsi.org/core/hasTimestamp> "${timestamp.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .\n`);
    
    // Sensor triple
    stream.write(`<${measurementId}> <https://saref.etsi.org/core/measurementMadeBy> <${sensor.sensorId}> .\n`);
    
    // Property triple
    stream.write(`<${measurementId}> <https://saref.etsi.org/core/relatesToProperty> <${sensor.propertyType}> .\n`);
    
    // Dataset triple
    stream.write(`<${measurementId}> <http://rdfs.org/ns/void#inDataset> <http://example.org/replayed-data> .\n`);
    
    // Add blank line for readability
    stream.write(`\n`);
  }

  private generateTrendValue(sensor: SensorDataConfig, timeProgress: number): number {
    const { min, max } = sensor.valueRange;
    const range = max - min;
    
    // Create different trend patterns based on sensor type
    if (sensor.propertyType.includes('Temperature')) {
      // Sinusoidal pattern (daily temperature cycle)
      const cyclicalValue = Math.sin(timeProgress * Math.PI * 2) * 0.3;
      return min + range * (0.5 + cyclicalValue);
    } else if (sensor.propertyType.includes('Humidity')) {
      // Inverse temperature correlation with some randomness
      const humidityValue = 0.7 - Math.sin(timeProgress * Math.PI * 2) * 0.2;
      return min + range * humidityValue;
    } else if (sensor.propertyType.includes('Pressure')) {
      // Gradual changes with weather patterns
      const pressureValue = 0.5 + Math.sin(timeProgress * Math.PI * 4) * 0.15;
      return min + range * pressureValue;
    } else if (sensor.propertyType.includes('Light')) {
      // Strong daily pattern (bright during day, dark at night)
      const lightCycle = Math.max(0, Math.sin(timeProgress * Math.PI * 2));
      return min + range * Math.pow(lightCycle, 2);
    } else {
      // Default linear trend
      return min + range * timeProgress;
    }
  }

  private addNoise(value: number, noiseLevel: number, range: { min: number; max: number }): number {
    const noiseAmount = (range.max - range.min) * noiseLevel;
    const noise = (Math.random() - 0.5) * 2 * noiseAmount;
    return Math.max(range.min, Math.min(range.max, value + noise));
  }
}