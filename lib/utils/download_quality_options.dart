import 'package:mornye/models/extension.dart';

/// SoundCloud's best full stream is lossy AAC, but users may still choose a
/// FLAC container when they explicitly want a consistent library format.
/// This ID identifies the AAC source tier for native quality negotiation.
const soundCloudFlacOutputQualityId = 'SC_AAC_160_OUTPUT';

List<QualityOption> downloadQualityOptionsFor(Extension extension) {
  final options = extension.qualityOptions;
  if (extension.id.trim().toLowerCase() != 'soundcloud' ||
      options.any(
        (option) =>
            option.id.trim().toUpperCase() == soundCloudFlacOutputQualityId ||
            option.id.trim().toUpperCase() == 'FLAC' ||
            option.id.trim().toUpperCase() == 'LOSSLESS',
      ) ||
      !options.any((option) => option.id.trim().toLowerCase() == 'aac_160')) {
    return options;
  }

  return [
    ...options,
    const QualityOption(
      id: soundCloudFlacOutputQualityId,
      label: 'FLAC (converted from SoundCloud audio)',
      description:
          'Saved as FLAC from SoundCloud audio (up to AAC 160 kbps). This changes the file format; it does not restore audio detail.',
    ),
  ];
}

bool isSoundCloudFlacOutputQuality(String service, String quality) {
  final normalizedService = service.trim().toLowerCase();
  final normalizedQuality = quality.trim().toUpperCase();
  return normalizedService == 'soundcloud' &&
      (normalizedQuality == soundCloudFlacOutputQualityId ||
          normalizedQuality == 'FLAC' ||
          normalizedQuality == 'LOSSLESS');
}
