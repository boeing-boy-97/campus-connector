import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_card_swiper/flutter_card_swiper.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_theme.dart';

// ─── Model ────────────────────────────────────────────────────────────────────

class StudentCard {
  final String id;
  final String fullName;
  final String bio;
  final List<String> profilePhotos;
  final String branch;
  final int year;
  final String gender;
  final List<String> interests;
  final Map<String, bool> intentFlags;

  const StudentCard({
    required this.id,
    required this.fullName,
    required this.bio,
    required this.profilePhotos,
    required this.branch,
    required this.year,
    required this.gender,
    required this.interests,
    required this.intentFlags,
  });

  factory StudentCard.fromMap(Map<String, dynamic> map) => StudentCard(
    id: map['id'] ?? '',
    fullName: map['full_name'] ?? '',
    bio: map['bio'] ?? '',
    profilePhotos: List<String>.from(map['profile_photos'] ?? []),
    branch: map['branch'] ?? '',
    year: (map['year'] as num?)?.toInt() ?? 1,
    gender: map['gender'] ?? '',
    interests: List<String>.from(map['interests'] ?? []),
    intentFlags: Map<String, bool>.from(map['intent_flags'] ?? {}),
  );

  String get displayYear => 'Year $year';
  String get avatarUrl => profilePhotos.isNotEmpty ? profilePhotos.first : '';

  List<String> get intentLabels {
    final labels = <String>[];
    if (intentFlags['dating'] == true) labels.add('💞 Dating');
    if (intentFlags['friendship'] == true) labels.add('🤝 Friends');
    if (intentFlags['study'] == true) labels.add('📚 Study');
    if (intentFlags['hackathon'] == true) labels.add('💻 Hackathon');
    if (intentFlags['project'] == true) labels.add('🚀 Projects');
    return labels;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

class DiscoveryNotifier extends StateNotifier<AsyncValue<List<StudentCard>>> {
  DiscoveryNotifier() : super(const AsyncValue.loading()) {
    _load();
  }

  static final _functions = FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);
  String? _lastDocId;
  bool _hasMore = true;

  Future<void> _load() async {
    try {
      final result = await _functions.httpsCallable('getRecommendations').call({
        'page_size': AppConstants.discoveryPageSize,
        if (_lastDocId != null) 'last_doc_id': _lastDocId,
      });

      final data = Map<String, dynamic>.from(result.data as Map);
      if (data['success'] == true) {
        final resData = Map<String, dynamic>.from(data['data'] as Map);
        final profiles = (resData['profiles'] as List)
            .map((p) => StudentCard.fromMap(Map<String, dynamic>.from(p as Map)))
            .toList();

        _hasMore = resData['has_more'] == true;
        if (profiles.isNotEmpty) _lastDocId = profiles.last.id;

        final current = state.valueOrNull ?? [];
        state = AsyncValue.data([...current, ...profiles]);
      }
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  void loadMore() {
    if (!_hasMore) return;
    _load();
  }

  void removeTop() {
    final current = state.valueOrNull ?? [];
    if (current.isNotEmpty) {
      state = AsyncValue.data(current.sublist(1));
      // Pre-fetch more when running low
      if (current.length <= 5 && _hasMore) loadMore();
    }
  }

  Future<void> refresh() async {
    _lastDocId = null;
    _hasMore = true;
    state = const AsyncValue.loading();
    await _load();
  }
}

final discoveryProvider = StateNotifierProvider.autoDispose<DiscoveryNotifier, AsyncValue<List<StudentCard>>>(
  (ref) => DiscoveryNotifier(),
);

// ─── Screen ───────────────────────────────────────────────────────────────────

class DiscoveryScreen extends ConsumerStatefulWidget {
  const DiscoveryScreen({super.key});

  @override
  ConsumerState<DiscoveryScreen> createState() => _DiscoveryScreenState();
}

class _DiscoveryScreenState extends ConsumerState<DiscoveryScreen> {
  final _swiperController = CardSwiperController();
  static final _functions = FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  Future<void> _sendRequest(String toId, String matchType) async {
    try {
      await _functions.httpsCallable('sendConnectRequest').call({
        'to_id': toId,
        'match_type': matchType,
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _swiperController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final discoveryState = ref.watch(discoveryProvider);
    final notifier = ref.read(discoveryProvider.notifier);
    final branding = ref.watch(collegeBrandingProvider);
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // ── Header ─────────────────────────────────────────────────────
            _DiscoveryHeader(branding: branding),

            // ── Cards ──────────────────────────────────────────────────────
            Expanded(
              child: discoveryState.when(
                loading: () => const _LoadingCards(),
                error: (e, _) => _ErrorState(onRetry: notifier.refresh),
                data: (cards) {
                  if (cards.isEmpty) return const _EmptyState();
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: CardSwiper(
                      controller: _swiperController,
                      cardsCount: cards.length,
                      onSwipe: (prev, current, dir) {
                        final card = cards[prev];
                        if (dir == CardSwiperDirection.right) {
                          _sendRequest(card.id, 'dating');
                          _showLikeOverlay(context);
                        } else if (dir == CardSwiperDirection.left) {
                          // Pass — no action
                        }
                        notifier.removeTop();
                        return true;
                      },
                      numberOfCardsDisplayed: 3,
                      backCardOffset: const Offset(0, 16),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      cardBuilder: (ctx, index, hr, vr) {
                        if (index >= cards.length) return const SizedBox.shrink();
                        return _ProfileCard(card: cards[index]);
                      },
                    ),
                  );
                },
              ),
            ),

            // ── Action buttons ─────────────────────────────────────────────
            discoveryState.whenData((cards) => cards.isNotEmpty
                ? _ActionButtons(
                    onPass: () => _swiperController.swipe(CardSwiperDirection.left),
                    onLike: () => _swiperController.swipe(CardSwiperDirection.right),
                    onSuperLike: () => _swiperController.swipe(CardSwiperDirection.top),
                  )
                : const SizedBox()).valueOrNull ?? const SizedBox(),

            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  void _showLikeOverlay(BuildContext context) {
    final overlay = Overlay.of(context);
    OverlayEntry? entry;
    entry = OverlayEntry(
      builder: (_) => Positioned.fill(
        child: IgnorePointer(
          child: Center(
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.5, end: 1.2),
              duration: const Duration(milliseconds: 400),
              curve: Curves.elasticOut,
              builder: (_, scale, child) => Transform.scale(scale: scale, child: child),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.green,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [BoxShadow(color: Colors.green.withOpacity(0.4), blurRadius: 20)],
                ),
                child: const Text('LIKED! 💞', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
              ),
            ),
          ),
        ),
      ),
    );
    overlay.insert(entry);
    Future.delayed(const Duration(milliseconds: 700), () => entry?.remove());
  }
}

// ─── Header ───────────────────────────────────────────────────────────────────

class _DiscoveryHeader extends StatelessWidget {
  final CollegeBranding branding;
  const _DiscoveryHeader({required this.branding});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        children: [
          // College logo or initial
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [branding.primaryColor, branding.secondaryColor],
              ),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Center(child: Text('🎓', style: TextStyle(fontSize: 18))),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppConstants.appName,
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                Text(
                  branding.collegeName,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: branding.primaryColor,
                    fontWeight: FontWeight.w500,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.tune_outlined),
            onPressed: () {},
            tooltip: 'Filters',
          ),
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {},
            tooltip: 'Notifications',
          ),
        ],
      ),
    );
  }
}

// ─── Profile Card ─────────────────────────────────────────────────────────────

class _ProfileCard extends StatefulWidget {
  final StudentCard card;
  const _ProfileCard({required this.card});

  @override
  State<_ProfileCard> createState() => _ProfileCardState();
}

class _ProfileCardState extends State<_ProfileCard> {
  int _currentPhotoIndex = 0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final card = widget.card;

    return GestureDetector(
      onTapDown: (details) {
        final width = MediaQuery.of(context).size.width;
        if (details.localPosition.dx < width / 2) {
          setState(() => _currentPhotoIndex = (_currentPhotoIndex - 1).clamp(0, card.profilePhotos.length - 1));
        } else {
          setState(() => _currentPhotoIndex = (_currentPhotoIndex + 1).clamp(0, card.profilePhotos.length - 1));
        }
      },
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppConstants.cardBorderRadius),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.15),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppConstants.cardBorderRadius),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Photo
              card.avatarUrl.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: card.profilePhotos[_currentPhotoIndex],
                      fit: BoxFit.cover,
                      placeholder: (_, __) => Container(color: theme.colorScheme.surfaceVariant),
                      errorWidget: (_, __, ___) => _AvatarPlaceholder(name: card.fullName),
                    )
                  : _AvatarPlaceholder(name: card.fullName),

              // Gradient overlay
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.transparent,
                        Colors.black.withOpacity(0.3),
                        Colors.black.withOpacity(0.85),
                      ],
                      stops: const [0.0, 0.45, 0.7, 1.0],
                    ),
                  ),
                ),
              ),

              // Photo index indicators
              if (card.profilePhotos.length > 1)
                Positioned(
                  top: 12,
                  left: 12,
                  right: 12,
                  child: Row(
                    children: List.generate(card.profilePhotos.length, (i) => Expanded(
                      child: Container(
                        height: 3,
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        decoration: BoxDecoration(
                          color: i == _currentPhotoIndex
                              ? Colors.white
                              : Colors.white.withOpacity(0.4),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    )),
                  ),
                ),

              // Profile info
              Positioned(
                left: 16,
                right: 16,
                bottom: 16,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Text(
                            '${card.fullName}, ${card.year == 1 ? '1st' : card.year == 2 ? '2nd' : card.year == 3 ? '3rd' : '${card.year}th'} Year',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                              shadows: [Shadow(blurRadius: 4)],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.info_outline, color: Colors.white),
                          onPressed: () => _showDetails(context),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      card.branch,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 14,
                        shadows: [Shadow(blurRadius: 4)],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: card.intentLabels.map((label) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white.withOpacity(0.4)),
                        ),
                        child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 12)),
                      )).toList(),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showDetails(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ProfileDetailSheet(card: widget.card),
    );
  }
}

class _AvatarPlaceholder extends StatelessWidget {
  final String name;
  const _AvatarPlaceholder({required this.name});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      color: theme.colorScheme.primaryContainer,
      child: Center(
        child: Text(
          name.isNotEmpty ? name[0].toUpperCase() : '?',
          style: TextStyle(
            fontSize: 80,
            fontWeight: FontWeight.w800,
            color: theme.colorScheme.onPrimaryContainer,
          ),
        ),
      ),
    );
  }
}

// ─── Profile Detail Sheet ─────────────────────────────────────────────────────

class _ProfileDetailSheet extends StatelessWidget {
  final StudentCard card;
  const _ProfileDetailSheet({required this.card});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      maxChildSize: 0.9,
      minChildSize: 0.4,
      builder: (ctx, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: theme.scaffoldBackgroundColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: ListView(
          controller: scrollCtrl,
          padding: const EdgeInsets.all(24),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.outline.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(card.fullName, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('${card.branch} · Year ${card.year}', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.primary)),
            const SizedBox(height: 16),
            Text(card.bio, style: theme.textTheme.bodyMedium?.copyWith(height: 1.6)),
            const SizedBox(height: 20),
            Text('Interests', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: card.interests.map((i) => Chip(label: Text(i))).toList(),
            ),
            const SizedBox(height: 20),
            Text('Looking for', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: card.intentLabels.map((i) => Chip(
                label: Text(i),
                backgroundColor: theme.colorScheme.primaryContainer,
                labelStyle: TextStyle(color: theme.colorScheme.onPrimaryContainer),
              )).toList(),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Action Buttons ───────────────────────────────────────────────────────────

class _ActionButtons extends StatelessWidget {
  final VoidCallback onPass;
  final VoidCallback onLike;
  final VoidCallback onSuperLike;

  const _ActionButtons({
    required this.onPass,
    required this.onLike,
    required this.onSuperLike,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _ActionButton(
            icon: Icons.close,
            color: Colors.redAccent,
            size: 52,
            onTap: onPass,
            tooltip: 'Pass',
          ),
          _ActionButton(
            icon: Icons.star,
            color: Colors.amber,
            size: 44,
            onTap: onSuperLike,
            tooltip: 'Super Like',
          ),
          _ActionButton(
            icon: Icons.favorite,
            color: Colors.green,
            size: 52,
            onTap: onLike,
            tooltip: 'Like',
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final double size;
  final VoidCallback onTap;
  final String tooltip;

  const _ActionButton({
    required this.icon,
    required this.color,
    required this.size,
    required this.onTap,
    required this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        shape: const CircleBorder(),
        color: Colors.white,
        elevation: 6,
        shadowColor: color.withOpacity(0.3),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: size,
            height: size,
            child: Icon(icon, color: color, size: size * 0.5),
          ),
        ),
      ),
    );
  }
}

// ─── Empty & Error States ─────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('🎉', style: TextStyle(fontSize: 64)),
            const SizedBox(height: 16),
            Text('You\'ve seen everyone!', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              'Check back later for new profiles from your college.',
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final Future<void> Function() onRetry;
  const _ErrorState({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.wifi_off_outlined, size: 48, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text('Failed to load profiles', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            ElevatedButton(onPressed: onRetry, child: const Text('Try Again')),
          ],
        ),
      ),
    );
  }
}

class _LoadingCards extends StatelessWidget {
  const _LoadingCards();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Text('Finding people near you…', style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}
