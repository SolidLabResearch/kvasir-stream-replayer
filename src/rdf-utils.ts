import { Parser, Quad } from 'n3';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { TimeseriesDataPoint, NTripleStatement } from './types';

export class RDFParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({ format: 'N-Triples' });
  }

  /**
   * Parse a single N-Triple line into a structured statement
   */
  parseNTriple(line: string): NTripleStatement | null {
    try {
      const quads = this.parser.parse(line);
      if (quads.length === 0) return null;
      
      const quad = quads[0];
      return {
        subject: quad.subject.value,
        predicate: quad.predicate.value,
        object: quad.object.value,
        objectType: quad.object.termType === 'Literal' ? 'literal' : 
                   quad.object.termType === 'BlankNode' ? 'bnode' : 'uri',
        datatype: quad.object.termType === 'Literal' ? 
                 (quad.object as any).datatype?.value : undefined,
        language: quad.object.termType === 'Literal' ? 
                 (quad.object as any).language : undefined
      };
    } catch (error) {
      console.warn(`Failed to parse N-Triple: ${line}`, error);
      return null;
    }
  }

  /**
   * Stream parse an .nt file and extract timeseries data points
   */
  async *parseTimeseriesFromFile(filePath: string): AsyncGenerator<TimeseriesDataPoint> {
    const fileStream = createReadStream(filePath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const measurements = new Map<string, Partial<TimeseriesDataPoint>>();

    for await (const line of rl) {
      if (line.trim() === '' || line.startsWith('#')) continue;
      
      const statement = this.parseNTriple(line);
      if (!statement) continue;

      const measurementId = statement.subject;
      if (!measurements.has(measurementId)) {
        measurements.set(measurementId, { id: measurementId });
      }

      const measurement = measurements.get(measurementId)!;
      
      // Extract common SAREF properties
      switch (statement.predicate) {
        case 'https://saref.etsi.org/core/hasValue':
          measurement.value = this.parseValue(statement.object, statement.datatype);
          measurement.valueType = statement.datatype || 'http://www.w3.org/2001/XMLSchema#string';
          break;
        case 'https://saref.etsi.org/core/hasTimestamp':
          measurement.timestamp = new Date(statement.object);
          break;
        case 'https://saref.etsi.org/core/measurementMadeBy':
          measurement.sensorId = statement.object;
          break;
        case 'https://saref.etsi.org/core/relatesToProperty':
          measurement.propertyType = statement.object;
          break;
        default:
          // Store other properties as metadata
          if (!measurement.metadata) measurement.metadata = {};
          measurement.metadata[statement.predicate] = statement.object;
      }

      // If we have all required fields, yield the measurement
      if (measurement.value !== undefined && measurement.timestamp) {
        yield measurement as TimeseriesDataPoint;
        measurements.delete(measurementId);
      }
    }

    // Yield any remaining measurements
    for (const measurement of measurements.values()) {
      if (measurement.value !== undefined && measurement.timestamp) {
        yield measurement as TimeseriesDataPoint;
      }
    }
  }

  private parseValue(value: string, datatype?: string): number | string | boolean {
    if (!datatype) return value;
    
    switch (datatype) {
      case 'http://www.w3.org/2001/XMLSchema#int':
      case 'http://www.w3.org/2001/XMLSchema#integer':
        return parseInt(value, 10);
      case 'http://www.w3.org/2001/XMLSchema#float':
      case 'http://www.w3.org/2001/XMLSchema#double':
      case 'http://www.w3.org/2001/XMLSchema#decimal':
        return parseFloat(value);
      case 'http://www.w3.org/2001/XMLSchema#boolean':
        return value.toLowerCase() === 'true';
      default:
        return value;
    }
  }

  /**
   * Convert TimeseriesDataPoint to Kvasir JSON-LD format
   */
  toKvasirJsonLD(dataPoints: TimeseriesDataPoint[]): any {
    return {
      '@context': {
        '@vocab': 'http://example.org/',
        'kss': 'https://kvasir.discover.ilabt.imec.be/vocab#',
        'saref': 'https://saref.etsi.org/core/',
        'xsd': 'http://www.w3.org/2001/XMLSchema#',
        'rdfs': 'http://rdfs.org/ns/void#'
      },
      'kss:insert': dataPoints.map(dp => ({
        '@id': dp.id,
        '@type': 'saref:Measurement',
        'saref:hasValue': dp.value,
        'saref:hasTimestamp': {
          '@value': dp.timestamp.toISOString(),
          '@type': 'xsd:dateTime'
        },
        ...(dp.sensorId && { 'saref:measurementMadeBy': dp.sensorId }),
        ...(dp.propertyType && { 'saref:relatesToProperty': dp.propertyType }),
        'rdfs:inDataset': 'http://example.org/replayed-data',
        ...dp.metadata
      }))
    };
  }
}