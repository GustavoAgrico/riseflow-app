# Gerar App Nativo RiseFlow

## Android
1. npm run build
2. npx cap sync android
3. npx cap open android (abre no Android Studio)
4. Build → Generate Signed Bundle / APK
5. Upload na Google Play Console

## iOS
1. npm run build
2. npx cap sync ios
3. npx cap open ios (abre no Xcode)
4. Signing & Capabilities → selecionar team
5. Product → Archive → Distribute App

## Atualizar após mudanças
1. npm run build
2. npx cap sync

## Testar no celular
- Android: npx cap run android
- iOS: npx cap run ios
