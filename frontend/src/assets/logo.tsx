import { type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Logo({
  className,
  alt = 'TongThai logo',
  ...props
}: Omit<ComponentProps<'img'>, 'src'>) {
  return (
    <img
      src='/images/logo-light.svg'
      alt={alt}
      width={48}
      height={32}
      className={cn('h-8 w-12 shrink-0 object-contain', className)}
      {...props}
    />
  )
}
