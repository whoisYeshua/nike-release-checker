import type { SnkrsRootResponse } from '../models/snkrsRootResponse.ts'

export type ProductFeedResponse = SnkrsRootResponse<ProductFeed>

export interface ProductFeed {
	readonly channelId: string
	readonly channelName: 'SNKRS Web'
	readonly collectionsv2: Collectionsv2
	readonly collectionTermIds: unknown[]
	readonly id: string
	readonly language: string
	readonly lastFetchTime: string // timestamp
	readonly links: ObjectLinks
	readonly marketplace: Marketplace
	readonly productInfo: ProductInfo[]
	readonly publishedContent: PublishedContent
	readonly resourceType: 'thread'
	readonly search: Search
}

export interface Collectionsv2 {
	readonly collectionTermIds: unknown[]
	readonly groupedCollectionTermIds: unknown
}

export interface ObjectLinks {
	readonly self: Self
}

export interface Self {
	readonly ref: string
}

export type Marketplace =
	| 'AE'
	| 'ASTLA'
	| 'AT'
	| 'AU'
	| 'BE'
	| 'BG'
	| 'CA'
	| 'CH'
	| 'CL'
	| 'CN'
	| 'CZ'
	| 'DE'
	| 'DK'
	| 'EG'
	| 'ES'
	| 'FI'
	| 'FR'
	| 'GB'
	| 'GR'
	| 'HR'
	| 'HU'
	| 'ID'
	| 'IE'
	| 'IL'
	| 'IN'
	| 'IT'
	| 'JP'
	| 'KR'
	| 'KW'
	| 'LU'
	| 'MA'
	| 'MX'
	| 'MY'
	| 'NL'
	| 'NO'
	| 'NZ'
	| 'PH'
	| 'PL'
	| 'PR'
	| 'PT'
	| 'QA'
	| 'RO'
	| 'RU'
	| 'SA'
	| 'SE'
	| 'SG'
	| 'SI'
	| 'SK'
	| 'TH'
	| 'TR'
	| 'TW'
	| 'US'
	| 'VN'
	| 'ZA'

export interface ProductInfo {
	readonly availability: Availability
	readonly availableGtins?: AvailableGtin[]
	readonly fastAvailability?: FastAvailability
	readonly launchView?: LaunchView
	readonly merchPrice: MerchPrice
	readonly merchProduct: MerchProduct
	readonly productContent: ProductContent
	readonly skus: Skus[]
	readonly socialInterest: SocialInterest
}

export interface Availability {
	readonly available: boolean
	readonly id: string
	readonly productId: string
	readonly resourceType: 'availableProducts'
}

export interface AvailableGtin {
	readonly available: boolean
	readonly gtin: string
	readonly level: Level
	readonly locationId: LocationID
	readonly method: 'SHIP'
	readonly styleColor: string
	readonly styleType: 'INLINE'
}

export type Level = 'HIGH' | 'LOW' | 'MEDIUM' | 'OOS'

export interface LocationID {
	readonly id: MerchGroup
	readonly type: 'merchGroup'
}

export type MerchGroup = 'CN' | 'EU' | 'JP' | 'MX' | 'US' | 'XA' | 'XP'

export interface FastAvailability {
	readonly skus: string[]
}

export interface LaunchView {
	readonly id: string
	readonly links: ObjectLinks
	readonly method: LaunchViewMethod
	readonly paymentMethod: 'PREPAY'
	readonly productId: string
	readonly resourceType: 'launchview'
	readonly startEntryDate: string // timestamp
	readonly stopEntryDate?: string // timestamp
}

export type LaunchViewMethod = 'DAN' | 'LEO'

export interface MerchPrice {
	readonly country: Marketplace
	readonly currency: string
	readonly currentPrice: number
	readonly discounted: boolean
	readonly fullPrice: number
	readonly id: string
	readonly links: ObjectLinks
	readonly modificationDate: string // timestamp
	readonly msrp?: number
	readonly parentId: string
	readonly parentType: 'merchProduct'
	readonly productId: string
	readonly promoExclusions: string[]
	readonly promoInclusions: string[]
	readonly resourceType: 'merchPrice'
	readonly snapshotId: string
}

export type PromoExclusion = 'FALSE' | 'TRUE'

export interface MerchProduct {
	readonly abTestValues: unknown[]
	readonly brand: Brand
	readonly catalogId: string
	readonly channels: Channel[]
	readonly classificationConcepts: unknown[]
	readonly colorCode: string
	readonly comingSoonCountdownClock: boolean
	readonly commerceCountryExclusions: Marketplace[]
	readonly commerceCountryInclusions: unknown[]
	readonly commerceEndDate?: string // timestamp
	readonly commercePublishDate?: string // timestamp
	readonly commerceStartDate: string // timestamp
	readonly consumerChannels: ConsumerChannel[]
	readonly customization?: Customization
	readonly exclusiveAccess: boolean
	readonly genders: Gender[]
	readonly hardLaunch: boolean
	readonly hideFromCSR: boolean
	readonly hideFromSearch: boolean
	readonly hidePayment: boolean
	readonly id: string
	readonly inventoryOverride: boolean
	readonly inventoryShareOff: boolean
	readonly isAppleWatch: boolean
	readonly isAttributionApproved: boolean
	readonly isCopyAvailable?: boolean
	readonly isCustomsApproved: boolean
	readonly isImageAvailable?: boolean
	readonly isPromoExclusionMessage: boolean
	readonly labelName: string
	readonly legacyCatalogIds: unknown[]
	readonly limitRetailExperience: LimitRetailExperience[]
	readonly links: ObjectLinks
	readonly mainColor: boolean
	readonly merchGroup: MerchGroup
	readonly modificationDate: string // timestamp
	readonly nikeIdStyleCode?: string
	readonly notifyMeIndicator: boolean
	readonly pid: string
	readonly preOrder: boolean
	readonly productGroupId: string
	readonly productRollup: ProductRollup
	readonly productType: ProductType
	readonly publishType: PublishType
	readonly quantityLimit: number
	readonly resourceType: 'merchProduct'
	readonly sizeConverterId: string
	readonly sizeGuideId: string
	readonly snapshotId: string
	readonly softLaunchDate?: string // timestamp
	readonly sportTags: SportTag[]
	readonly status: Status
	readonly styleCode: string
	readonly styleColor: string
	readonly styleType: 'INLINE'
	readonly taxonomyAttributes: TaxonomyAttribute[]
	readonly valueAddedServices: ValueAddedService[]
}

export type Brand = 'Jordan' | 'Nike'

export type Channel = 'Nike Store Experiences' | 'Nike.com' | 'NikeApp' | 'SNKRS' | 'WeChat'

export interface ConsumerChannel {
	readonly id: string
	readonly resourceType: 'globalization/consumer_channels'
}

export interface Customization {
	readonly nikeIdStyleCode: string
}

export type Gender = 'BOYS' | 'GIRLS' | 'MEN' | 'WOMEN'

export interface LimitRetailExperience {
	readonly disabledStoreOfferingCodes: string[]
	readonly value: LimitRetailExperienceValue
}

export type LimitRetailExperienceValue = 'Nike App Self-Checkout' | 'Scan to Learn' | 'Scan to Try'

export interface ProductRollup {
	readonly key: string
	readonly type: 'Standard'
}

export type ProductType = 'APPAREL' | 'FOOTWEAR'

export type PublishType = 'FLOW' | 'LAUNCH'

export type SportTag = 'Basketball' | 'Dance' | 'Lifestyle' | 'Skateboarding' | 'Soccer' | 'Tennis'

export type Status = 'ACTIVE' | 'HOLD' | 'INACTIVE'

export interface TaxonomyAttribute {
	readonly ids: string[]
	readonly resourceType: 'merch/taxonomy_attributes'
}

export interface ValueAddedService {
	readonly id: string
	readonly vasType: VasType
}

export type VasType = 'GIFT_MESSAGE' | 'GIFT_WRAP'

export interface ProductContent {
	readonly athletes: Athlete[]
	readonly bestFor: unknown[]
	readonly colorDescription: string
	readonly colors: Color[]
	readonly description: string
	readonly descriptionHeading: string
	readonly fullTitle: string
	readonly globalPid: string
	readonly langLocale: LangLocale
	readonly manufacturingCountriesOfOrigin: string[]
	readonly slug?: string
	readonly subtitle: string
	readonly techSpec: string
	readonly title: string
	readonly widths: Width[]
}

export interface Athlete {
	readonly localizedValue: string
}

export interface Color {
	readonly hex: string
	readonly name: string
	readonly type: ColorType
}

export type ColorType = 'LOGO' | 'PRIMARY' | 'SECONDARY' | 'SIMPLE' | 'TERTIARY'

export type LangLocale =
	| 'cs_CZ'
	| 'da_DK'
	| 'de_DE'
	| 'el_GR'
	| 'en_GB'
	| 'en_US'
	| 'es_ES'
	| 'es_LA'
	| 'fr_FR'
	| 'it_IT'
	| 'ja_JP'
	| 'nl_NL'
	| 'no_NO'
	| 'pl_PL'
	| 'pt_PT'
	| 'sv_SE'
	| 'th_TH'
	| 'tr_TR'
	| 'zh_CN'
	| 'zh_TW'

export interface Width {
	readonly localizedValue: string
	readonly value: 'REGULAR'
}

export interface Skus {
	readonly catalogSkuId: string
	readonly countrySpecifications: CountrySpecification[]
	readonly gtin: string
	readonly id: string
	readonly links: ObjectLinks
	readonly merchGroup: MerchGroup
	readonly modificationDate: string // timestamp
	readonly nikeSize: string
	readonly parentId: string
	readonly parentType: 'merchProduct'
	readonly productId: string
	readonly resourceType: 'merchSku'
	readonly sizeConversionId?: string
	readonly snapshotId: string
	readonly stockKeepingUnitId: string
	readonly vatCode?: string
}

export interface CountrySpecification {
	readonly country: Marketplace
	readonly localizedSize: string
	readonly localizedSizePrefix?: LocalizedSizePrefix
	readonly taxInfo: TaxInfo
}

export type LocalizedSizePrefix = 'CM' | 'EU' | 'JP' | 'UK' | 'US'

export interface TaxInfo {
	readonly commodityCode?: string
}

export interface SocialInterest {
	readonly id: string
}

export interface PublishedContent {
	readonly analytics: Analytics
	readonly collectionGroupId: string
	readonly createdDateTime: string // timestamp
	readonly externalReferences: ExternalReference[]
	readonly id: string
	readonly language: string
	readonly links: PublishedContentLinks
	readonly marketplace: Marketplace
	readonly nodes: PublishedContentNode[]
	readonly payloadType: 'thread'
	readonly preview: boolean
	readonly properties: PublishedContentProperties
	readonly publishEndDate: string // timestamp
	readonly publishStartDate: string // timestamp
	readonly resourceType: 'publishedContent'
	readonly subType: 'thread'
	readonly supportedLanguages: unknown[]
	readonly type: 'thread'
	readonly version: string
	readonly viewStartDate: string // timestamp
}

export interface Analytics {
	readonly hashKey: string
}

export interface ExternalReference {
	readonly domain: 'control_plane'
	readonly id: string
	readonly resource: 'execution'
}

export interface PublishedContentLinks {
	readonly self: string
}

export interface PublishedContentNode {
	readonly analytics: Analytics
	readonly id: string
	readonly nodes?: Node[]
	readonly properties: PublishedContentNodeProperties
	readonly subType: ContainerTypeEnum
	readonly type: 'card'
	readonly version: string
}

export interface Node {
	readonly analytics: Analytics
	readonly id: string
	readonly properties: PurpleProperties
	readonly subType: ContainerTypeEnum
	readonly type: 'card'
	readonly version: string
}

export interface PurpleProperties {
	readonly actions: unknown[]
	readonly altText: string
	readonly colorTheme: 'dark'
	readonly copyId: string
	readonly custom?: unknown
	readonly fallbacks?: unknown[]
	readonly imageCaption?: string
	readonly internalName?: string
	readonly landscape: Landscape
	readonly landscapeId?: string
	readonly landscapeURL: string
	readonly portrait: Landscape
	readonly portraitId?: string
	readonly portraitURL: string
	readonly product?: unknown[]
	readonly richTextLinks: unknown[]
	readonly secondaryPortrait?: SecondaryPortrait
	readonly squarish: Landscape
	readonly squarishId?: string
	readonly squarishURL: string
	readonly style?: Style
	readonly subtitle: string
	readonly title: string
}

export interface Portrait {
	readonly startImageUrl?: string
	readonly assetId?: string
	readonly manifestURL?: string
	readonly providerId?: string
	readonly videoId?: string
}

export interface Landscape {
	readonly aspectRatio?: number
	readonly id: string
	readonly type?: LandscapeType
	readonly url?: string
	readonly view?: string // 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'H' | 'Q' | 'K' | 'P' | 'S' | 'U' | 'Y' | 'Z'
}

export type LandscapeType = 'editorial' | 'product'

export interface SecondaryPortrait {
	readonly id?: string
	readonly url?: string
	readonly aspectRatio?: number
	readonly type?: LandscapeType
}

export interface Style {
	readonly defaultStyle: unknown
	readonly exposeTemplate: boolean
	readonly modifiedDate: string // timestamp
	readonly properties: StyleProperties
	readonly resourceType: 'content/style'
}

export interface StyleProperties {
	readonly actions: unknown
}

export type ContainerTypeEnum = 'carousel' | 'image' | 'text' | 'video'

export interface PublishedContentNodeProperties {
	readonly actions: Action[]
	readonly altText?: string
	readonly autoPlay?: boolean
	readonly body?: string
	readonly colorTheme: 'dark'
	readonly containerType?: ContainerTypeEnum
	readonly copyId: string
	readonly custom?: unknown
	readonly fallbacks?: unknown[]
	readonly imageCaption?: string
	readonly internalName?: string
	readonly jsonBody?: JSONBody
	readonly landscape?: Landscape
	readonly landscapeId?: string
	readonly landscapeURL?: string
	readonly loop?: boolean
	readonly portrait?: Landscape | Portrait
	readonly portraitId?: string
	readonly portraitURL?: string
	readonly product?: unknown[]
	readonly richTextLinks: RichTextLink[]
	readonly secondaryPortrait?: Landscape
	readonly speed?: number
	readonly squarish?: Landscape
	readonly squarishId?: string
	readonly squarishURL?: string
	readonly startImageURL?: string
	readonly videoId?: string
	readonly aspectRatio?: number
	readonly manifestURL?: string
	readonly providerId?: string
	readonly assetId?: string
	readonly startImage?: Partial<CoverCardProperties>
	readonly style?: Style
	readonly subtitle: string
	readonly title: string
}

export interface Action {
	readonly actionType: 'cta_buying_tools'
	readonly analytics: Analytics
	readonly destination: Destination
	readonly destinationId: string
	readonly id: string
	readonly product: Product
}

export interface Destination {
	readonly product: Product
	readonly type: 'BUYING_TOOLS'
}

export interface Product {
	readonly productId: string
	readonly styleColor: string
}

export interface JSONBody {
	readonly content: JSONBodyContent[]
	readonly type: 'doc'
}

export interface JSONBodyContent {
	readonly content: ContentInnerContent[]
	readonly type: 'paragraph'
}

export interface ContentInnerContent {
	readonly marks?: Mark[]
	readonly text: string
	readonly type: ContainerTypeEnum
}

export interface Mark {
	readonly attrs?: Attrs
	readonly type: MarkType
}

export interface Attrs {
	readonly 'data-id'?: string
	readonly href: string
	readonly target: '_blank'
}

export type MarkType = 'link' | 'underline'

export interface RichTextLink {
	readonly id: string
	readonly type: 'URL'
	readonly url: string
}

export interface PublishedContentProperties {
	readonly coverCard: CoverCard
	readonly custom: Custom
	readonly metadataDecorations?: MetadataDecoration[]
	readonly products: Product[]
	readonly publish: Publish
	readonly relatedThreads?: string[]
	readonly seo: SEO
	readonly social?: Social
	readonly subtitle?: string
	readonly threadType: PublishedContentThreadType
	readonly title?: string
}

export interface CoverCard {
	readonly analytics: Analytics
	readonly id: string
	readonly properties: CoverCardProperties
	readonly subType: ContainerTypeEnum
	readonly type: 'card'
	readonly version: string
}

export interface CoverCardProperties {
	readonly actions: unknown[]
	readonly altText: string
	readonly body?: string
	readonly colorTheme: 'dark' | 'light'
	readonly copyId: string
	readonly custom: unknown
	readonly fallbacks?: unknown[]
	readonly internalName?: string
	readonly imageCaption?: string
	readonly landscape: Landscape
	readonly landscapeId: string
	readonly landscapeURL: string
	readonly portrait: Landscape
	readonly portraitId: string
	readonly portraitURL: string
	readonly product: unknown[]
	readonly richTextLinks: unknown[]
	readonly secondaryPortrait?: Landscape
	readonly squarish: Landscape
	readonly squarishId: string
	readonly squarishURL: string
	readonly style: Style
	readonly subtitle: string
	readonly title: string
}

export interface Custom {
	readonly hideFromStock?: unknown[]
	readonly hideFromUpcoming?: Product[]
	readonly restricted?: boolean
	readonly tags?: string[]
}

export interface MetadataDecoration {
	readonly id: string
	readonly namespace: string
	readonly payload: MetadataDecorationPayload
}

export interface MetadataDecorationPayload {
	readonly hideFeedCard: boolean
}

export interface Publish {
	readonly collectionGroups: string[]
	readonly collections: string[]
	readonly countries: Marketplace[]
	readonly pageId?: string
}

export interface SEO {
	readonly description: string
	readonly doNotIndex: boolean
	readonly keywords: string
	readonly slug: string
	readonly title: string
}

export interface Social {
	readonly comments: boolean
	readonly likes: boolean
	readonly share: boolean
}

export type PublishedContentThreadType = 'multi_product' | 'product'

export interface Search {
	readonly conceptIds: string[]
}
