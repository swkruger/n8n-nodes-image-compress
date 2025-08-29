import type { INodeExecutionData, INodeProperties, INodeType, INodeTypeDescription } from 'n8n-workflow';
import sharp from 'sharp';
import path from 'node:path';

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function pngCompressionLevelFromQuality(quality: number): number {
	const q = clamp(Math.round(quality), 0, 100);
	const level = Math.round(((100 - q) * 9) / 100);
	return clamp(level, 0, 9);
}

function getMimeAndExt(format: string): { mime: string; ext: string } {
	switch (format) {
		case 'jpg':
		case 'jpeg':
			return { mime: 'image/jpeg', ext: 'jpg' };
		case 'png':
			return { mime: 'image/png', ext: 'png' };
		case 'webp':
			return { mime: 'image/webp', ext: 'webp' };
		case 'avif':
			return { mime: 'image/avif', ext: 'avif' };
		default:
			return { mime: 'application/octet-stream', ext: 'bin' };
	}
}

export class CompressImage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Compress Image',
		name: 'compressImage',
		icon: 'fa:image',
		group: ['transform'],
		version: 1,
		description: 'Compress, convert, and optionally resize images (JPEG/PNG/WebP/AVIF).',
		documentationUrl: 'https://github.com/lovell/sharp',
		defaults: {
			name: 'Compress Image',
			color: '#f97316'
		},
		codex: {
			categories: ['Image'],
			subcategories: {
				Image: ['Transform'],
			},
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Input Source',
				name: 'inputSource',
				type: 'options',
				default: 'binary',
				options: [
					{ name: 'Binary Property', value: 'binary' },
					{ name: 'Base64 Field (JSON)', value: 'base64' },
				],
				description: 'Where to read the input image from',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				displayOptions: {
					show: {
						inputSource: ['binary'],
					},
				},
				description: 'Name of the binary property to read the input image from',
			},
			{
				displayName: 'Base64 Field',
				name: 'base64FieldName',
				type: 'string',
				default: 'imageBase64',
				displayOptions: {
					show: {
						inputSource: ['base64'],
					},
				},
				description: 'Name of the JSON field that contains the Base64-encoded image',
			},
			{
				displayName: 'Output Binary Property',
				name: 'outputBinaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property to store the compressed image',
			},
			{
				displayName: 'Output Format',
				name: 'format',
				type: 'options',
				default: 'jpg',
				options: [
					{ name: 'JPEG', value: 'jpg' },
					{ name: 'PNG', value: 'png' },
					{ name: 'WebP', value: 'webp' },
					{ name: 'AVIF', value: 'avif' },
				],
				description: 'Desired output image format',
			},
			{
				displayName: 'Strip Metadata',
				name: 'stripMetadata',
				type: 'boolean',
				default: true,
				description: 'Whether to remove EXIF/ICC metadata (smaller files). Disable to preserve metadata.',
			},
			{
				displayName: 'Quality',
				name: 'quality',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 100 },
				default: 80,
				description: 'Image quality (0-100). For PNG mapped to compression level.',
			},
			{
				displayName: 'Resize',
				name: 'resize',
				type: 'collection',
				placeholder: 'Add Resize Options',
				default: {},
				options: [
					{ displayName: 'Width', name: 'width', type: 'number', default: 0, description: 'Target width in pixels (0 = ignore)' },
					{ displayName: 'Height', name: 'height', type: 'number', default: 0, description: 'Target height in pixels (0 = ignore)' },
					{ displayName: 'Maintain Aspect Ratio', name: 'maintainAspectRatio', type: 'boolean', default: true },
				],
				description: 'Resize options. If only one dimension is provided, the other is calculated when aspect ratio is maintained.',
			},
			{
				displayName: 'Max Input Size (MB)',
				name: 'maxInputSizeMb',
				type: 'number',
				default: 25,
				typeOptions: { minValue: 1, maxValue: 512 },
				description: 'Reject images larger than this to avoid excessive memory usage',
			},
		],
	};

	async execute(this: any): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const inputSource = this.getNodeParameter('inputSource', i) as 'binary' | 'base64';
				const format = this.getNodeParameter('format', i) as 'jpg' | 'png' | 'webp' | 'avif';
				const stripMetadata = this.getNodeParameter('stripMetadata', i) as boolean;
				const quality = clamp(this.getNodeParameter('quality', i) as number, 0, 100);
				const resize = this.getNodeParameter('resize', i, {}) as { width?: number; height?: number; maintainAspectRatio?: boolean };
				const outputBinaryPropertyName = this.getNodeParameter('outputBinaryPropertyName', i) as string;
				const maxInputSizeMb = this.getNodeParameter('maxInputSizeMb', i) as number;

				let inputBuffer: Buffer;
				let originalFileName: string | undefined;
				let originalMimeType: string | undefined;

				if (inputSource === 'binary') {
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
					const binaryData = items[i].binary?.[binaryPropertyName];
					if (!binaryData) {
						throw new Error(`No binary data found under property "${binaryPropertyName}"`);
					}
					inputBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
					originalFileName = binaryData.fileName;
					originalMimeType = binaryData.mimeType;
				} else {
					const base64FieldName = this.getNodeParameter('base64FieldName', i) as string;
					const b64raw = items[i].json?.[base64FieldName];
					if (typeof b64raw !== 'string' || b64raw.length === 0) {
						throw new Error(`Field "${base64FieldName}" must contain a Base64 string`);
					}
					const cleaned = b64raw.replace(/^data:[^;]+;base64,/, '');
					inputBuffer = Buffer.from(cleaned, 'base64');
					originalFileName = 'input';
				}

				const originalSize = inputBuffer.length;
				const maxBytes = Math.max(1, Math.floor(maxInputSizeMb)) * 1024 * 1024;
				if (originalSize > maxBytes) {
					throw new Error(`Input image is too large (${originalSize} bytes). Max allowed is ${maxBytes} bytes.`);
				}

				let image = sharp(inputBuffer).rotate();

				const width = typeof resize.width === 'number' && resize.width > 0 ? Math.floor(resize.width) : undefined;
				const height = typeof resize.height === 'number' && resize.height > 0 ? Math.floor(resize.height) : undefined;
				const maintainAspectRatio = resize.maintainAspectRatio !== false;

				if (width || height) {
					image = image.resize({
						width,
						height,
						fit: maintainAspectRatio ? 'inside' : 'fill',
						withoutEnlargement: true,
					});
				}

				if (!stripMetadata) {
					image = image.withMetadata();
				}

				switch (format) {
					case 'jpg':
						image = image.jpeg({ quality, mozjpeg: true });
						break;
					case 'png':
						image = image.png({ compressionLevel: pngCompressionLevelFromQuality(quality), palette: true });
						break;
					case 'webp':
						image = image.webp({ quality });
						break;
					case 'avif':
						image = image.avif({ quality });
						break;
					default:
						break;
				}

				const outputBuffer = await image.toBuffer();
				const newSize = outputBuffer.length;
				const percentReduction = originalSize > 0 ? ((originalSize - newSize) / originalSize) * 100 : 0;

				const { mime, ext } = getMimeAndExt(format);
				const baseName = originalFileName ? path.parse(originalFileName).name : 'image';
				const outFileName = `${baseName}.${ext}`;

				const binary = await this.helpers.prepareBinaryData(outputBuffer, outFileName, mime);

				const newItem: INodeExecutionData = {
					json: {
						...items[i].json,
						compression: {
							originalSize,
							newSize,
							percentReduction,
							format,
						},
					},
					binary: { ...items[i].binary, [outputBinaryPropertyName]: binary },
				};

				returnData.push(newItem);
			} catch (err) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (err as Error).message }, binary: items[i].binary });
					continue;
				}
				throw err;
			}
		}

		return [returnData];
	}
}
