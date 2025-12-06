import * as v from 'valibot'
import { createSnkrsRootResponseSchema } from '../models/snkrsRootResponse.ts'

export const MarketplaceSchema = v.union([
	v.literal('AE'),
	v.literal('ASTLA'),
	v.literal('AT'),
	v.literal('AU'),
	v.literal('BE'),
	v.literal('BG'),
	v.literal('CA'),
	v.literal('CH'),
	v.literal('CL'),
	v.literal('CN'),
	v.literal('CZ'),
	v.literal('DE'),
	v.literal('DK'),
	v.literal('EG'),
	v.literal('ES'),
	v.literal('FI'),
	v.literal('FR'),
	v.literal('GB'),
	v.literal('GR'),
	v.literal('HR'),
	v.literal('HU'),
	v.literal('ID'),
	v.literal('IE'),
	v.literal('IL'),
	v.literal('IN'),
	v.literal('IT'),
	v.literal('JP'),
	v.literal('KR'),
	v.literal('KW'),
	v.literal('LU'),
	v.literal('MA'),
	v.literal('MX'),
	v.literal('MY'),
	v.literal('NL'),
	v.literal('NO'),
	v.literal('NZ'),
	v.literal('PH'),
	v.literal('PL'),
	v.literal('PR'),
	v.literal('PT'),
	v.literal('QA'),
	v.literal('RO'),
	v.literal('RU'),
	v.literal('SA'),
	v.literal('SE'),
	v.literal('SG'),
	v.literal('SI'),
	v.literal('SK'),
	v.literal('TH'),
	v.literal('TR'),
	v.literal('TW'),
	v.literal('US'),
	v.literal('VN'),
	v.literal('ZA'),
])

export const Collectionsv2Schema = v.object({
	collectionTermIds: v.array(v.unknown()),
	groupedCollectionTermIds: v.unknown(),
})

export const SelfSchema = v.object({
	ref: v.string(),
})

export const ObjectLinksSchema = v.object({
	self: SelfSchema,
})

export const AvailabilitySchema = v.object({
	available: v.boolean(),
	id: v.string(),
	productId: v.string(),
	resourceType: v.literal('availableProducts'),
})

export const MerchGroupSchema = v.union([
	v.literal('CN'),
	v.literal('EU'),
	v.literal('JP'),
	v.literal('MX'),
	v.literal('US'),
	v.literal('XA'),
	v.literal('XP'),
])

export const LevelSchema = v.union([
	v.literal('HIGH'),
	v.literal('LOW'),
	v.literal('MEDIUM'),
	v.literal('OOS'),
	v.literal('NA'),
])

export const LocationIDSchema = v.object({
	id: MerchGroupSchema,
	type: v.literal('merchGroup'),
})

export const AvailableGtinSchema = v.object({
	available: v.boolean(),
	gtin: v.string(),
	level: LevelSchema,
	locationId: LocationIDSchema,
	method: v.literal('SHIP'),
	styleColor: v.string(),
	styleType: v.literal('INLINE'),
})

export const FastAvailabilitySchema = v.object({
	skus: v.array(v.string()),
})

export const LaunchViewMethodSchema = v.union([v.literal('DAN'), v.literal('LEO')])

export const LaunchViewSchema = v.object({
	id: v.string(),
	links: ObjectLinksSchema,
	method: LaunchViewMethodSchema,
	paymentMethod: v.literal('PREPAY'),
	productId: v.string(),
	resourceType: v.literal('launchview'),
	startEntryDate: v.string(),
	stopEntryDate: v.optional(v.string()),
})

export const MerchPriceSchema = v.object({
	country: MarketplaceSchema,
	currency: v.string(),
	currentPrice: v.number(),
	discounted: v.boolean(),
	fullPrice: v.number(),
	id: v.string(),
	links: ObjectLinksSchema,
	modificationDate: v.string(),
	msrp: v.optional(v.number()),
	parentId: v.string(),
	parentType: v.literal('merchProduct'),
	productId: v.string(),
	promoExclusions: v.array(v.string()),
	promoInclusions: v.array(v.string()),
	resourceType: v.literal('merchPrice'),
	snapshotId: v.string(),
})

export const PromoExclusionSchema = v.union([v.literal('FALSE'), v.literal('TRUE')])

export const BrandSchema = v.union([v.literal('Jordan'), v.literal('Nike')])

export const ChannelSchema = v.union([
	v.literal('Nike Store Experiences'),
	v.literal('Nike.com'),
	v.literal('NikeApp'),
	v.literal('SNKRS'),
	v.literal('WeChat'),
])

export const ConsumerChannelSchema = v.object({
	id: v.string(),
	resourceType: v.literal('globalization/consumer_channels'),
})

export const CustomizationSchema = v.object({
	nikeIdStyleCode: v.string(),
})

export const GenderSchema = v.union([v.literal('BOYS'), v.literal('GIRLS'), v.literal('MEN'), v.literal('WOMEN')])

export const LimitRetailExperienceValueSchema = v.union([
	v.literal('Nike App Self-Checkout'),
	v.literal('Scan to Learn'),
	v.literal('Scan to Try'),
])

export const LimitRetailExperienceSchema = v.object({
	disabledStoreOfferingCodes: v.array(v.string()),
	value: LimitRetailExperienceValueSchema,
})

export const ProductRollupSchema = v.object({
	key: v.string(),
	type: v.literal('Standard'),
})

export const ProductTypeSchema = v.union([v.literal('APPAREL'), v.literal('FOOTWEAR')])

export const PublishTypeSchema = v.union([v.literal('FLOW'), v.literal('LAUNCH')])

export const SportTagSchema = v.union([
	v.literal('Basketball'),
	v.literal('Dance'),
	v.literal('Lifestyle'),
	v.literal('Skateboarding'),
	v.literal('Soccer'),
	v.literal('Tennis'),
])

export const StatusSchema = v.union([v.literal('ACTIVE'), v.literal('HOLD'), v.literal('INACTIVE')])

export const TaxonomyAttributeSchema = v.object({
	ids: v.array(v.string()),
	resourceType: v.literal('merch/taxonomy_attributes'),
})

export const VasTypeSchema = v.union([v.literal('GIFT_MESSAGE'), v.literal('GIFT_WRAP')])

export const ValueAddedServiceSchema = v.object({
	id: v.string(),
	vasType: VasTypeSchema,
})

export const MerchProductSchema = v.object({
	abTestValues: v.array(v.unknown()),
	brand: BrandSchema,
	catalogId: v.string(),
	channels: v.array(ChannelSchema),
	classificationConcepts: v.array(v.unknown()),
	colorCode: v.string(),
	comingSoonCountdownClock: v.boolean(),
	commerceCountryExclusions: v.array(MarketplaceSchema),
	commerceCountryInclusions: v.array(v.unknown()),
	commerceEndDate: v.optional(v.string()),
	commercePublishDate: v.optional(v.string()),
	commerceStartDate: v.string(),
	consumerChannels: v.array(ConsumerChannelSchema),
	customization: v.optional(CustomizationSchema),
	exclusiveAccess: v.boolean(),
	genders: v.array(GenderSchema),
	hardLaunch: v.boolean(),
	hideFromCSR: v.boolean(),
	hideFromSearch: v.boolean(),
	hidePayment: v.boolean(),
	id: v.string(),
	inventoryOverride: v.boolean(),
	inventoryShareOff: v.boolean(),
	isAppleWatch: v.boolean(),
	isAttributionApproved: v.boolean(),
	isCopyAvailable: v.optional(v.boolean()),
	isCustomsApproved: v.boolean(),
	isImageAvailable: v.optional(v.boolean()),
	isPromoExclusionMessage: v.boolean(),
	labelName: v.string(),
	legacyCatalogIds: v.array(v.unknown()),
	limitRetailExperience: v.array(LimitRetailExperienceSchema),
	links: ObjectLinksSchema,
	mainColor: v.boolean(),
	merchGroup: MerchGroupSchema,
	modificationDate: v.string(),
	nikeIdStyleCode: v.optional(v.string()),
	notifyMeIndicator: v.boolean(),
	pid: v.string(),
	preOrder: v.boolean(),
	productGroupId: v.string(),
	productRollup: ProductRollupSchema,
	productType: ProductTypeSchema,
	publishType: PublishTypeSchema,
	quantityLimit: v.number(),
	resourceType: v.literal('merchProduct'),
	sizeConverterId: v.string(),
	sizeGuideId: v.string(),
	snapshotId: v.string(),
	softLaunchDate: v.optional(v.string()),
	sportTags: v.array(SportTagSchema),
	status: StatusSchema,
	styleCode: v.string(),
	styleColor: v.string(),
	styleType: v.literal('INLINE'),
	taxonomyAttributes: v.array(TaxonomyAttributeSchema),
	valueAddedServices: v.array(ValueAddedServiceSchema),
})

export const AthleteSchema = v.object({
	localizedValue: v.string(),
})

export const ColorTypeSchema = v.union([
	v.literal('LOGO'),
	v.literal('PRIMARY'),
	v.literal('SECONDARY'),
	v.literal('SIMPLE'),
	v.literal('TERTIARY'),
])

export const ColorSchema = v.object({
	hex: v.string(),
	name: v.string(),
	type: ColorTypeSchema,
})

export const LangLocaleSchema = v.union([
	v.literal('cs_CZ'),
	v.literal('da_DK'),
	v.literal('de_DE'),
	v.literal('el_GR'),
	v.literal('en_GB'),
	v.literal('en_US'),
	v.literal('es_ES'),
	v.literal('es_LA'),
	v.literal('fr_FR'),
	v.literal('it_IT'),
	v.literal('ja_JP'),
	v.literal('nl_NL'),
	v.literal('no_NO'),
	v.literal('pl_PL'),
	v.literal('pt_PT'),
	v.literal('sv_SE'),
	v.literal('th_TH'),
	v.literal('tr_TR'),
	v.literal('zh_CN'),
	v.literal('zh_TW'),
])

export const WidthSchema = v.object({
	localizedValue: v.string(),
	value: v.literal('REGULAR'),
})

export const ProductContentSchema = v.object({
	athletes: v.array(AthleteSchema),
	bestFor: v.array(v.unknown()),
	colorDescription: v.string(),
	colors: v.array(ColorSchema),
	description: v.string(),
	descriptionHeading: v.string(),
	fullTitle: v.string(),
	globalPid: v.string(),
	langLocale: LangLocaleSchema,
	manufacturingCountriesOfOrigin: v.array(v.string()),
	slug: v.optional(v.string()),
	subtitle: v.string(),
	techSpec: v.string(),
	title: v.string(),
	widths: v.array(WidthSchema),
})

export const CountrySpecificationSchema = v.object({
	country: MarketplaceSchema,
	localizedSize: v.string(),
	localizedSizePrefix: v.optional(
		v.union([v.literal('CM'), v.literal('EU'), v.literal('JP'), v.literal('UK'), v.literal('US')]),
	),
	taxInfo: v.object({
		commodityCode: v.optional(v.string()),
	}),
})

export const SkusSchema = v.object({
	catalogSkuId: v.string(),
	countrySpecifications: v.array(CountrySpecificationSchema),
	gtin: v.string(),
	id: v.string(),
	links: ObjectLinksSchema,
	merchGroup: MerchGroupSchema,
	modificationDate: v.string(),
	nikeSize: v.string(),
	parentId: v.string(),
	parentType: v.literal('merchProduct'),
	productId: v.string(),
	resourceType: v.literal('merchSku'),
	sizeConversionId: v.optional(v.string()),
	snapshotId: v.string(),
	stockKeepingUnitId: v.string(),
	vatCode: v.optional(v.string()),
})

export const TaxInfoSchema = v.object({
	commodityCode: v.optional(v.string()),
})

export const SocialInterestSchema = v.object({
	id: v.string(),
})

export const FastProductInfoSchema = v.object({
	availability: AvailabilitySchema,
	availableGtins: v.optional(v.array(AvailableGtinSchema)),
	fastAvailability: v.optional(FastAvailabilitySchema),
	launchView: v.optional(LaunchViewSchema),
	merchPrice: MerchPriceSchema,
	merchProduct: MerchProductSchema,
	productContent: ProductContentSchema,
	skus: v.array(SkusSchema),
	socialInterest: SocialInterestSchema,
})

export const AnalyticsSchema = v.object({
	hashKey: v.string(),
})

export const ExternalReferenceSchema = v.object({
	domain: v.literal('control_plane'),
	id: v.string(),
	resource: v.literal('execution'),
})

export const PublishedContentLinksSchema = v.object({
	self: v.string(),
})

export const PortraitSchema = v.object({
	startImageUrl: v.optional(v.string()),
	assetId: v.optional(v.string()),
	manifestURL: v.optional(v.string()),
	providerId: v.optional(v.string()),
	videoId: v.optional(v.string()),
})

export const LandscapeTypeSchema = v.union([v.literal('editorial'), v.literal('product')])

export const LandscapeSchema = v.object({
	aspectRatio: v.optional(v.number()),
	id: v.string(),
	type: v.optional(LandscapeTypeSchema),
	url: v.optional(v.string()),
	view: v.optional(v.string()),
})

export const SecondaryPortraitSchema = v.object({
	id: v.optional(v.string()),
	url: v.optional(v.string()),
	aspectRatio: v.optional(v.number()),
	type: v.optional(LandscapeTypeSchema),
})

export const StylePropertiesSchema = v.object({
	actions: v.unknown(),
})

export const StyleSchema = v.object({
	defaultStyle: v.unknown(),
	exposeTemplate: v.boolean(),
	modifiedDate: v.string(),
	properties: StylePropertiesSchema,
	resourceType: v.literal('content/style'),
})

export const ContainerTypeEnumSchema = v.union([
	v.literal('carousel'),
	v.literal('image'),
	v.literal('text'),
	v.literal('video'),
])

export const CoverCardPropertiesSchema = v.object({
	actions: v.array(v.unknown()),
	altText: v.string(),
	body: v.optional(v.string()),
	colorTheme: v.union([v.literal('dark'), v.literal('light')]),
	copyId: v.string(),
	custom: v.unknown(),
	fallbacks: v.optional(v.array(v.unknown())),
	internalName: v.optional(v.string()),
	imageCaption: v.optional(v.string()),
	landscape: LandscapeSchema,
	landscapeId: v.string(),
	landscapeURL: v.string(),
	portrait: LandscapeSchema,
	portraitId: v.string(),
	portraitURL: v.string(),
	product: v.array(v.unknown()),
	richTextLinks: v.array(v.unknown()),
	secondaryPortrait: v.optional(LandscapeSchema),
	squarish: LandscapeSchema,
	squarishId: v.string(),
	squarishURL: v.string(),
	style: StyleSchema,
	subtitle: v.string(),
	title: v.string(),
})

export const CoverCardSchema = v.object({
	analytics: AnalyticsSchema,
	id: v.string(),
	properties: CoverCardPropertiesSchema,
	subType: ContainerTypeEnumSchema,
	type: v.literal('card'),
	version: v.string(),
})

export const CustomSchema = v.object({
	hideFromStock: v.optional(v.array(v.unknown())),
	hideFromUpcoming: v.optional(v.array(v.object({ productId: v.string(), styleColor: v.string() }))),
	restricted: v.optional(v.boolean()),
	tags: v.optional(v.array(v.string())),
})

export const MetadataDecorationPayloadSchema = v.object({
	hideFeedCard: v.boolean(),
})

export const MetadataDecorationSchema = v.object({
	id: v.string(),
	namespace: v.string(),
	payload: MetadataDecorationPayloadSchema,
})

export const ProductSchema = v.object({
	productId: v.string(),
	styleColor: v.string(),
})

export const PublishSchema = v.object({
	collectionGroups: v.array(v.string()),
	collections: v.array(v.string()),
	countries: v.array(MarketplaceSchema),
	pageId: v.optional(v.string()),
})

export const SEOSchema = v.object({
	description: v.string(),
	doNotIndex: v.boolean(),
	keywords: v.string(),
	slug: v.string(),
	title: v.string(),
})

export const SocialSchema = v.object({
	comments: v.boolean(),
	likes: v.boolean(),
	share: v.boolean(),
})

export const PublishedContentThreadTypeSchema = v.union([v.literal('multi_product'), v.literal('product')])

export const PublishedContentPropertiesSchema = v.object({
	coverCard: CoverCardSchema,
	custom: CustomSchema,
	metadataDecorations: v.optional(v.array(MetadataDecorationSchema)),
	products: v.array(ProductSchema),
	publish: PublishSchema,
	relatedThreads: v.optional(v.array(v.string())),
	seo: SEOSchema,
	social: v.optional(SocialSchema),
	subtitle: v.optional(v.string()),
	threadType: PublishedContentThreadTypeSchema,
	title: v.optional(v.string()),
})

export const RichTextLinkSchema = v.object({
	id: v.string(),
	type: v.literal('URL'),
	url: v.string(),
})

export const AttrsSchema = v.object({
	'data-id': v.optional(v.string()),
	href: v.string(),
	target: v.literal('_blank'),
})

export const MarkTypeSchema = v.union([v.literal('link'), v.literal('underline')])

export const MarkSchema = v.object({
	attrs: v.optional(AttrsSchema),
	type: MarkTypeSchema,
})

export const ContentInnerContentSchema = v.object({
	marks: v.optional(v.array(MarkSchema)),
	text: v.string(),
	type: ContainerTypeEnumSchema,
})

export const JSONBodyContentSchema = v.object({
	content: v.array(ContentInnerContentSchema),
	type: v.literal('paragraph'),
})

export const JSONBodySchema = v.object({
	content: v.array(JSONBodyContentSchema),
	type: v.literal('doc'),
})

export const DestinationSchema = v.object({
	product: ProductSchema,
	type: v.literal('BUYING_TOOLS'),
})

export const ActionSchema = v.object({
	actionType: v.literal('cta_buying_tools'),
	analytics: AnalyticsSchema,
	destination: DestinationSchema,
	destinationId: v.string(),
	id: v.string(),
	product: ProductSchema,
})

export const PublishedContentNodePropertiesSchema = v.object({
	actions: v.array(ActionSchema),
	altText: v.optional(v.string()),
	autoPlay: v.optional(v.boolean()),
	body: v.optional(v.string()),
	colorTheme: v.literal('dark'),
	containerType: v.optional(ContainerTypeEnumSchema),
	copyId: v.string(),
	custom: v.optional(v.unknown()),
	fallbacks: v.optional(v.array(v.unknown())),
	imageCaption: v.optional(v.string()),
	internalName: v.optional(v.string()),
	jsonBody: v.optional(JSONBodySchema),
	landscape: v.optional(LandscapeSchema),
	landscapeId: v.optional(v.string()),
	landscapeURL: v.optional(v.string()),
	loop: v.optional(v.boolean()),
	portrait: v.optional(v.union([LandscapeSchema, PortraitSchema])),
	portraitId: v.optional(v.string()),
	portraitURL: v.optional(v.string()),
	product: v.optional(v.array(v.unknown())),
	richTextLinks: v.array(RichTextLinkSchema),
	secondaryPortrait: v.optional(LandscapeSchema),
	speed: v.optional(v.number()),
	squarish: v.optional(LandscapeSchema),
	squarishId: v.optional(v.string()),
	squarishURL: v.optional(v.string()),
	startImageURL: v.optional(v.string()),
	videoId: v.optional(v.string()),
	aspectRatio: v.optional(v.number()),
	manifestURL: v.optional(v.string()),
	providerId: v.optional(v.string()),
	assetId: v.optional(v.string()),
	startImage: v.optional(v.partial(CoverCardPropertiesSchema)),
	style: v.optional(StyleSchema),
	subtitle: v.string(),
	title: v.string(),
})

export const PurplePropertiesSchema = v.object({
	actions: v.array(v.unknown()),
	altText: v.string(),
	colorTheme: v.literal('dark'),
	copyId: v.string(),
	custom: v.optional(v.unknown()),
	fallbacks: v.optional(v.array(v.unknown())),
	imageCaption: v.optional(v.string()),
	internalName: v.optional(v.string()),
	landscape: LandscapeSchema,
	landscapeId: v.optional(v.string()),
	landscapeURL: v.string(),
	portrait: LandscapeSchema,
	portraitId: v.optional(v.string()),
	portraitURL: v.string(),
	product: v.optional(v.array(v.unknown())),
	richTextLinks: v.array(v.unknown()),
	secondaryPortrait: v.optional(SecondaryPortraitSchema),
	squarish: LandscapeSchema,
	squarishId: v.optional(v.string()),
	squarishURL: v.string(),
	style: v.optional(StyleSchema),
	subtitle: v.string(),
	title: v.string(),
})

export const NodeSchema = v.object({
	analytics: AnalyticsSchema,
	id: v.string(),
	properties: PurplePropertiesSchema,
	subType: ContainerTypeEnumSchema,
	type: v.literal('card'),
	version: v.string(),
})

export const PublishedContentNodeSchema = v.object({
	analytics: AnalyticsSchema,
	id: v.string(),
	nodes: v.optional(v.array(NodeSchema)),
	properties: PublishedContentNodePropertiesSchema,
	subType: ContainerTypeEnumSchema,
	type: v.literal('card'),
	version: v.string(),
})

export const PublishedContentSchema = v.object({
	analytics: AnalyticsSchema,
	collectionGroupId: v.string(),
	createdDateTime: v.string(),
	externalReferences: v.array(ExternalReferenceSchema),
	id: v.string(),
	language: v.string(),
	links: PublishedContentLinksSchema,
	marketplace: MarketplaceSchema,
	nodes: v.array(PublishedContentNodeSchema),
	payloadType: v.literal('thread'),
	preview: v.boolean(),
	properties: PublishedContentPropertiesSchema,
	publishEndDate: v.string(),
	publishStartDate: v.string(),
	resourceType: v.literal('publishedContent'),
	subType: v.literal('thread'),
	supportedLanguages: v.array(v.unknown()),
	type: v.literal('thread'),
	version: v.string(),
	viewStartDate: v.string(),
})

export const ProductInfoSchema = v.object({
	availability: AvailabilitySchema,
	availableGtins: v.optional(v.array(AvailableGtinSchema)),
	fastAvailability: v.optional(FastAvailabilitySchema),
	launchView: v.optional(LaunchViewSchema),
	merchPrice: MerchPriceSchema,
	merchProduct: MerchProductSchema,
	productContent: ProductContentSchema,
	skus: v.array(SkusSchema),
	socialInterest: SocialInterestSchema,
})

export const SearchSchema = v.object({
	conceptIds: v.array(v.string()),
})

export const ProductFeedSchema = v.object({
	channelId: v.string(),
	channelName: v.literal('SNKRS Web'),
	collectionsv2: Collectionsv2Schema,
	collectionTermIds: v.array(v.unknown()),
	id: v.string(),
	language: v.string(),
	lastFetchTime: v.string(),
	links: ObjectLinksSchema,
	marketplace: MarketplaceSchema,
	productInfo: v.array(ProductInfoSchema),
	publishedContent: PublishedContentSchema,
	resourceType: v.literal('thread'),
	search: SearchSchema,
})

export const ProductFeedResponseSchema = createSnkrsRootResponseSchema(ProductFeedSchema)

export type MarketplaceOutput = v.InferOutput<typeof MarketplaceSchema>
export type Collectionsv2Output = v.InferOutput<typeof Collectionsv2Schema>
export type SelfOutput = v.InferOutput<typeof SelfSchema>
export type ObjectLinksOutput = v.InferOutput<typeof ObjectLinksSchema>
export type AvailabilityOutput = v.InferOutput<typeof AvailabilitySchema>
export type MerchGroupOutput = v.InferOutput<typeof MerchGroupSchema>
export type LevelOutput = v.InferOutput<typeof LevelSchema>
export type LocationIDOutput = v.InferOutput<typeof LocationIDSchema>
export type AvailableGtinOutput = v.InferOutput<typeof AvailableGtinSchema>
export type FastAvailabilityOutput = v.InferOutput<typeof FastAvailabilitySchema>
export type LaunchViewMethodOutput = v.InferOutput<typeof LaunchViewMethodSchema>
export type LaunchViewOutput = v.InferOutput<typeof LaunchViewSchema>
export type MerchPriceOutput = v.InferOutput<typeof MerchPriceSchema>
export type PromoExclusionOutput = v.InferOutput<typeof PromoExclusionSchema>
export type BrandOutput = v.InferOutput<typeof BrandSchema>
export type ChannelOutput = v.InferOutput<typeof ChannelSchema>
export type ConsumerChannelOutput = v.InferOutput<typeof ConsumerChannelSchema>
export type CustomizationOutput = v.InferOutput<typeof CustomizationSchema>
export type GenderOutput = v.InferOutput<typeof GenderSchema>
export type LimitRetailExperienceValueOutput = v.InferOutput<typeof LimitRetailExperienceValueSchema>
export type LimitRetailExperienceOutput = v.InferOutput<typeof LimitRetailExperienceSchema>
export type ProductRollupOutput = v.InferOutput<typeof ProductRollupSchema>
export type ProductTypeOutput = v.InferOutput<typeof ProductTypeSchema>
export type PublishTypeOutput = v.InferOutput<typeof PublishTypeSchema>
export type SportTagOutput = v.InferOutput<typeof SportTagSchema>
export type StatusOutput = v.InferOutput<typeof StatusSchema>
export type TaxonomyAttributeOutput = v.InferOutput<typeof TaxonomyAttributeSchema>
export type VasTypeOutput = v.InferOutput<typeof VasTypeSchema>
export type ValueAddedServiceOutput = v.InferOutput<typeof ValueAddedServiceSchema>
export type MerchProductOutput = v.InferOutput<typeof MerchProductSchema>
export type AthleteOutput = v.InferOutput<typeof AthleteSchema>
export type ColorTypeOutput = v.InferOutput<typeof ColorTypeSchema>
export type ColorOutput = v.InferOutput<typeof ColorSchema>
export type LangLocaleOutput = v.InferOutput<typeof LangLocaleSchema>
export type WidthOutput = v.InferOutput<typeof WidthSchema>
export type ProductContentOutput = v.InferOutput<typeof ProductContentSchema>
export type CountrySpecificationOutput = v.InferOutput<typeof CountrySpecificationSchema>
export type SkusOutput = v.InferOutput<typeof SkusSchema>
export type TaxInfoOutput = v.InferOutput<typeof TaxInfoSchema>
export type SocialInterestOutput = v.InferOutput<typeof SocialInterestSchema>
export type AnalyticsOutput = v.InferOutput<typeof AnalyticsSchema>
export type ExternalReferenceOutput = v.InferOutput<typeof ExternalReferenceSchema>
export type PublishedContentLinksOutput = v.InferOutput<typeof PublishedContentLinksSchema>
export type PortraitOutput = v.InferOutput<typeof PortraitSchema>
export type LandscapeTypeOutput = v.InferOutput<typeof LandscapeTypeSchema>
export type LandscapeOutput = v.InferOutput<typeof LandscapeSchema>
export type SecondaryPortraitOutput = v.InferOutput<typeof SecondaryPortraitSchema>
export type StylePropertiesOutput = v.InferOutput<typeof StylePropertiesSchema>
export type StyleOutput = v.InferOutput<typeof StyleSchema>
export type ContainerTypeEnumOutput = v.InferOutput<typeof ContainerTypeEnumSchema>
export type CoverCardPropertiesOutput = v.InferOutput<typeof CoverCardPropertiesSchema>
export type CoverCardOutput = v.InferOutput<typeof CoverCardSchema>
export type CustomOutput = v.InferOutput<typeof CustomSchema>
export type MetadataDecorationPayloadOutput = v.InferOutput<typeof MetadataDecorationPayloadSchema>
export type MetadataDecorationOutput = v.InferOutput<typeof MetadataDecorationSchema>
export type ProductOutput = v.InferOutput<typeof ProductSchema>
export type PublishOutput = v.InferOutput<typeof PublishSchema>
export type SEOOutput = v.InferOutput<typeof SEOSchema>
export type SocialOutput = v.InferOutput<typeof SocialSchema>
export type PublishedContentThreadTypeOutput = v.InferOutput<typeof PublishedContentThreadTypeSchema>
export type PublishedContentPropertiesOutput = v.InferOutput<typeof PublishedContentPropertiesSchema>
export type RichTextLinkOutput = v.InferOutput<typeof RichTextLinkSchema>
export type AttrsOutput = v.InferOutput<typeof AttrsSchema>
export type MarkTypeOutput = v.InferOutput<typeof MarkTypeSchema>
export type MarkOutput = v.InferOutput<typeof MarkSchema>
export type ContentInnerContentOutput = v.InferOutput<typeof ContentInnerContentSchema>
export type JSONBodyContentOutput = v.InferOutput<typeof JSONBodyContentSchema>
export type JSONBodyOutput = v.InferOutput<typeof JSONBodySchema>
export type DestinationOutput = v.InferOutput<typeof DestinationSchema>
export type ActionOutput = v.InferOutput<typeof ActionSchema>
export type PublishedContentNodePropertiesOutput = v.InferOutput<typeof PublishedContentNodePropertiesSchema>
export type PurplePropertiesOutput = v.InferOutput<typeof PurplePropertiesSchema>
export type NodeOutput = v.InferOutput<typeof NodeSchema>
export type PublishedContentNodeOutput = v.InferOutput<typeof PublishedContentNodeSchema>
export type PublishedContentOutput = v.InferOutput<typeof PublishedContentSchema>
export type ProductInfoOutput = v.InferOutput<typeof ProductInfoSchema>
export type SearchOutput = v.InferOutput<typeof SearchSchema>
export type ProductFeedOutput = v.InferOutput<typeof ProductFeedSchema>

