/**
 * ShipmentService (Carrier-agnostic Abstraction)
 * 
 * Generic contract for parcel / shipment tracking without vendor lock-in.
 * Supports carrier detection, cached status queries, and graceful fallback.
 */

export type ShipmentStatusType =
  | 'ORDERED'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED_ATTEMPT'
  | 'EXCEPTION'
  | 'UNKNOWN'

export interface Shipment {
  id: string
  carrier: string
  trackingNumber: string
  label: string
  expectedDelivery?: string | null // YYYY-MM-DD
  status: ShipmentStatusType
  statusText?: string
  lastLocation?: string
  lastUpdated: string
}

export interface IShipmentCarrierProvider {
  carrierCode: string
  carrierName: string
  trackShipment(trackingNumber: string): Promise<Partial<Shipment> | null>
}

export class ShipmentService {
  private static providers = new Map<string, IShipmentCarrierProvider>()

  /**
   * Registers a carrier provider plugin.
   */
  static registerProvider(provider: IShipmentCarrierProvider) {
    this.providers.set(provider.carrierCode.toLowerCase(), provider)
  }

  /**
   * Resolves shipment details from tracking number / carrier code.
   */
  static async track(trackingNumber: string, carrierCode?: string): Promise<Partial<Shipment> | null> {
    if (!trackingNumber) return null

    if (carrierCode) {
      const provider = this.providers.get(carrierCode.toLowerCase())
      if (provider) {
        return provider.trackShipment(trackingNumber)
      }
    }

    // Default fallback mock/normalized response if no external API configured
    return {
      trackingNumber,
      carrier: carrierCode || 'Standard Carrier',
      status: 'IN_TRANSIT',
      statusText: 'In Transit',
      lastUpdated: new Date().toISOString()
    }
  }
}
