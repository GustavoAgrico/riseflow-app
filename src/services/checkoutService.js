// Re-exporta abacatePayService com a mesma interface que o código existente espera.
// Isso evita alterar todos os arquivos que importam checkoutService.
export { abacatePayService as checkoutService } from '@services/abacatePayService'
