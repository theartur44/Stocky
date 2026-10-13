import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import type { Product } from '../domain/models';
import { t } from '../i18n';
import { lookupProduct } from '../integrations/openFoodFacts';
import { useApp } from '../state/AppProvider';
import { errorMessage, logError } from '../state/errors';
import { resolveScan, type ScanOutcome } from '../services/scanService';
import { Body, Button, Card, LoadingView, Notice, Screen, TextField, Title } from '../ui/components';
import { radius, spacing } from '../ui/theme';

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'code128'];

type Mode = 'inventory' | 'shopping';

export default function ScanScreen() {
  const params = useLocalSearchParams<{ mode?: string; listId?: string }>();
  const mode: Mode = params.mode === 'shopping' ? 'shopping' : 'inventory';
  const { services } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const lastScan = useRef<{ code: string; at: number } | null>(null);
  const processing = useRef(false);

  const goManual = useCallback(
    (code: string | null) => {
      if (mode === 'shopping') {
        router.back();
        return;
      }
      router.replace({ pathname: '/product/new', params: code ? { barcode: code } : {} });
    },
    [mode],
  );

  const addKnownToShopping = useCallback(
    async (product: Product) => {
      const listId = params.listId ?? (await services.shopping.ensureDefaultList()).id;
      await services.shopping.addItem(listId, {
        name: product.name,
        productId: product.id,
        quantityMilli: 1000,
        unit: product.defaultUnit,
      });
      router.back();
    },
    [params.listId, services],
  );

  const handleOutcome = useCallback(
    async (outcome: ScanOutcome) => {
      switch (outcome.kind) {
        case 'invalid':
          setMessage(t('scan.invalidCode'));
          return;
        case 'internal':
          setMessage(t('scan.internalCode'));
          return;
        case 'known':
          if (mode === 'shopping') await addKnownToShopping(outcome.product);
          else router.replace({ pathname: '/lot/edit', params: { productId: outcome.product.id } });
          return;
        case 'needs_consent':
          askConsent(outcome.code);
          return;
        case 'lookup_disabled':
          setPendingCode(outcome.code);
          setMessage(t('scan.lookupDisabled'));
          return;
        case 'not_found':
          setPendingCode(outcome.code);
          setMessage(t('scan.notFound'));
          return;
        case 'error':
          setPendingCode(outcome.code);
          setMessage(errorMessage(outcome.error));
          return;
        case 'found': {
          const e = outcome.external;
          if (mode === 'shopping') {
            // Se guarda en el catálogo (sin existencias) para conservar el código.
            const product = await services.inventory.createProduct({
              name: e.name ?? e.brand ?? outcome.code,
              brand: e.brand,
              barcode: outcome.code,
              category: e.category,
              defaultUnit: e.suggestedUnit,
              defaultLocation: 'pantry',
              imageUrl: e.imageUrl,
              source: 'openfoodfacts',
            });
            await addKnownToShopping(product);
            return;
          }
          router.replace({
            pathname: '/product/new',
            params: {
              barcode: outcome.code,
              name: e.name ?? '',
              brand: e.brand ?? '',
              imageUrl: e.imageUrl ?? '',
              category: e.category,
              unit: e.suggestedUnit,
              source: 'openfoodfacts',
            },
          });
          return;
        }
      }
    },
    // askConsent se define más abajo y solo depende de estado estable.
    [mode, addKnownToShopping, services],
  );

  const process = useCallback(
    async (raw: string, type?: string) => {
      if (processing.current) return;
      processing.current = true;
      setBusy(true);
      setMessage(null);
      setPendingCode(null);
      try {
        const outcome = await resolveScan(raw, type, {
          inventory: services.inventory,
          settings: services.settings,
          lookup: (code) => lookupProduct(code),
        });
        await handleOutcome(outcome);
      } catch (e) {
        logError('scan.process', e);
        setMessage(errorMessage(e));
      } finally {
        processing.current = false;
        setBusy(false);
      }
    },
    [services, handleOutcome],
  );

  function askConsent(code: string) {
    Alert.alert(t('scan.consentTitle'), t('scan.consentBody'), [
      {
        text: t('scan.consentDeny'),
        style: 'cancel',
        onPress: async () => {
          await services.settings.setLookupConsent(false);
          goManual(code);
        },
      },
      {
        text: t('scan.consentAccept'),
        onPress: async () => {
          await services.settings.setLookupConsent(true);
          void process(code);
        },
      },
    ]);
  }

  const onScanned = ({ data, type }: { data: string; type: string }) => {
    const now = Date.now();
    // La cámara emite el mismo código muchas veces por segundo.
    if (lastScan.current && lastScan.current.code === data && now - lastScan.current.at < 3000) return;
    lastScan.current = { code: data, at: now };
    void process(data, type);
  };

  if (!permission) return <LoadingView />;

  return (
    <Screen>
      {permission.granted ? (
        <View style={styles.cameraBox} accessible accessibilityLabel={t('scan.hint')}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={busy ? undefined : onScanned}
          />
        </View>
      ) : (
        <Card>
          <Title>{t('scan.permissionTitle')}</Title>
          <Body>{t('scan.permissionBody')}</Body>
          {permission.canAskAgain ? (
            <Button label={t('scan.permissionButton')} icon="camera-outline" onPress={() => void requestPermission()} />
          ) : (
            <>
              <Notice message={t('scan.permissionDenied')} tone="warning" />
              <Button label={t('scan.openSettings')} variant="secondary" onPress={() => void Linking.openSettings()} />
            </>
          )}
        </Card>
      )}

      {permission.granted ? <Body muted>{t('scan.hint')}</Body> : null}
      {busy ? <Notice message={t('scan.searching')} /> : null}
      {message ? <Notice message={message} tone="warning" /> : null}
      {pendingCode && mode === 'inventory' ? (
        <Button label={t('scan.addManually')} icon="create-outline" onPress={() => goManual(pendingCode)} />
      ) : null}

      <Card>
        <TextField
          label={t('scan.manualEntry')}
          placeholder={t('scan.manualPlaceholder')}
          value={manual}
          onChangeText={setManual}
          keyboardType="number-pad"
          maxLength={20}
          returnKeyType="search"
          onSubmitEditing={() => void process(manual)}
        />
        <Button label={t('common.search')} icon="search" variant="secondary" disabled={!manual.trim() || busy} onPress={() => void process(manual)} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraBox: { height: 280, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', marginBottom: spacing.sm },
});
