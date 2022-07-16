import React, {
  CSSProperties,
  ImgHTMLAttributes,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { IEnlarge, ICompress } from './icons'
import { usePrevious, useDOMQueryObserver } from './hooks'

import {
  getImgAlt,
  getImgSrc,
  getStyleGhost,
  getStyleModalImg,
  testDiv,
  testImg,
  testSvg,
} from './utils'

// =============================================================================

const enum ModalState {
  LOADED,
  LOADING,
  UNLOADED,
  UNLOADING,
}

// =============================================================================

export interface BaseProps {
  a11yNameButtonUnzoom?: string
  a11yNameButtonZoom?: string
  children: ReactNode
  isZoomed: boolean
  onZoomChange?: (value: boolean) => void
  scrollableEl?: HTMLElement | Window
  zoomImg?: ImgHTMLAttributes<HTMLImageElement>
  zoomMargin?: number
}

export default function Base ({
  a11yNameButtonUnzoom = 'Minimize image',
  a11yNameButtonZoom = 'Expand image',
  children,
  isZoomed,
  onZoomChange,
  scrollableEl = window, // @TODO
  zoomImg,
  zoomMargin = 0,
}: BaseProps) {
  const idModalImg = useState(() => `rmiz-modal-img-${Math.random().toString(16).slice(-4)}`)[0]
  const [loadedImgEl, setLoadedImgEl] = useState<HTMLImageElement>()
  const [modalState, setModalState] = useState<ModalState>(() => ModalState.UNLOADED)
  const [isZoomImgLoaded, setIsZoomImgLoaded] = useState(() => false)
  const [forceUpdateVal, forceUpdate] = useState(() => 0)

  const refContent = useRef<HTMLDivElement>(null)
  const refDialog = useRef<HTMLDialogElement>(null)
  const refModalImg = useRef<HTMLImageElement>(null)
  const refWrap = useRef<HTMLDivElement>(null)

  const prevIsZoomed = usePrevious(isZoomed)

  // ===========================================================================

  const findImgEl = useCallback(() => {
    return refContent.current?.querySelector?.('img, svg, [role="img"], [data-zoom]')
  }, [])

  const imgEl = useDOMQueryObserver(findImgEl)

  const isDiv = testDiv(imgEl)
  const isImg = testImg(imgEl)
  const isSvg = testSvg(imgEl)

  const imgSizes = isImg ? imgEl.sizes : undefined
  const imgSrcSet = isImg ? imgEl.srcset : undefined
  const imgAlt = getImgAlt(imgEl)
  const imgSrc = getImgSrc(imgEl)

  const zoomImgSizes = zoomImg?.sizes
  const zoomImgSrc = zoomImg?.src
  const zoomImgSrcSet = zoomImg?.srcSet
  const hasZoomImg = !!zoomImgSrc

  const isModalZoomed = isZoomed && (
    modalState === ModalState.LOADING || modalState === ModalState.LOADED
  )

  // ===========================================================================

  const styleContent: CSSProperties = {
    visibility: modalState === ModalState.UNLOADED ? 'visible' : 'hidden',
  }

  const styleGhost = getStyleGhost(imgEl)

  const styleModalImg = useMemo(() => {
    return imgEl && (loadedImgEl || isSvg)
      ? getStyleModalImg({
        hasZoomImg,
        imgSrc,
        isSvg,
        isZoomed: isModalZoomed,
        loadedImgEl,
        offset: zoomMargin,
        shouldRefresh: forceUpdateVal > 0,
        targetEl: imgEl,
      })
      : {}
  }, [
    forceUpdateVal, // Simply needed to break the memo cache on scroll
    hasZoomImg,
    imgEl,
    imgSrc,
    isSvg,
    isModalZoomed,
    loadedImgEl,
    zoomMargin,
  ])

  // ===========================================================================

  const dataOverlayState =
    modalState === ModalState.UNLOADED || modalState === ModalState.UNLOADING
      ? 'hidden'
      : 'visible'

  // ===========================================================================

  // Report zoom state change
  const handleOpen = useCallback(() => { onZoomChange?.(true) }, [onZoomChange])
  const handleClose = useCallback(() => { onZoomChange?.(false) }, [onZoomChange])

  // Intercept default dialog.close() and use ours so we can animate
  const handleDialogKeyDown = useCallback((e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape' || e.keyCode === 27) {
      e.preventDefault()
      e.stopPropagation()
      handleClose()
    }
  }, [handleClose])

  // Force re-renders on closing scroll
  const handleScroll = useCallback(() => {
    forceUpdate(n => n + 1)
    handleClose()
  }, [handleClose])

  // Force re-render on resize
  const handleResize = useCallback(() => {
    forceUpdate(n => n + 1)
  }, [])

  const loadZoomImg = useCallback(() => {
    if (zoomImgSrc) {
      const img = new Image()
      img.src = zoomImgSrc
      img.sizes = zoomImgSizes || ''
      img.srcset = zoomImgSrcSet || ''

      img.decode().then(() => {
        setIsZoomImgLoaded(true)
      })
    }
  }, [zoomImgSizes, zoomImgSrc, zoomImgSrcSet])

  // Perform zoom actions
  const zoom = useCallback(() => {
    refDialog.current?.showModal?.()
    setModalState(ModalState.LOADING)
    loadZoomImg()

    refModalImg.current?.addEventListener?.('transitionend', () => {
      setTimeout(() => {
        setModalState(ModalState.LOADED)
        scrollableEl.addEventListener('scroll', handleScroll)
        window.addEventListener('resize', handleResize)
      }, 0)
    }, { once: true })
  }, [handleScroll, handleResize, loadZoomImg, scrollableEl])

  // Perform unzoom actions
  const unzoom = useCallback(() => {
    setModalState(ModalState.UNLOADING)

    refModalImg.current?.addEventListener?.('transitionend', () => {
      setTimeout(() => {
        window.removeEventListener('resize', handleResize)
        scrollableEl.removeEventListener('scroll', handleScroll)
        setModalState(ModalState.UNLOADED)
        forceUpdate(0)
        refDialog.current?.close?.()
      }, 0)
    }, { once: true })
  }, [handleResize, handleScroll, scrollableEl])

  // ===========================================================================

  // Ensure we always have the latest img src value loaded
  useEffect(() => {
    if (imgSrc) {
      const handleImgLoad = () => {
        const img = new Image()
        img.src = imgSrc

        if (isImg) {
          img.sizes = imgSizes || ''
          img.srcset = imgSrcSet || ''
        }

        img.decode().then(() => {
          setLoadedImgEl(img)
        })
      }

      handleImgLoad()
      imgEl?.addEventListener('load', handleImgLoad)

      return () => {
        imgEl?.removeEventListener('load', handleImgLoad)
      }
    }
  }, [imgEl, imgSizes, imgSrc, imgSrcSet, isImg])

  // Show modal when zoomed; hide modal when unzoomed
  useEffect(() => {
    if (!prevIsZoomed && isZoomed) {
      zoom()
    } else if (prevIsZoomed && !isZoomed) {
      unzoom()
    }
  }, [isZoomed, prevIsZoomed, unzoom, zoom])

  // Handle clicking the image
  useEffect(() => {
    imgEl?.addEventListener?.('click', handleOpen)

    return () => {
      imgEl?.removeEventListener?.('click', handleOpen)
    }
  }, [handleOpen, imgEl])

  // Cleanup lingering handlers
  useEffect(() => {
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [handleResize, handleScroll])

  // Hackily deal with SVGs because of all of their unknowns.
  useEffect(() => {
    if (isSvg && imgEl) {
      const tmp = document.createElement('div')
      tmp.innerHTML = imgEl.outerHTML

      const svg = tmp.firstChild as SVGSVGElement
      svg.style.width = `${styleModalImg.width}px`
      svg.style.height = `${styleModalImg.height}px`

      refModalImg.current?.firstChild?.remove()
      refModalImg.current?.appendChild(svg)
    }
  }, [imgEl, isSvg, styleModalImg.height, styleModalImg.width])

  // ===========================================================================

  return (
    <div data-rmiz ref={refWrap}>
      <div data-rmiz-content ref={refContent} style={styleContent}>
        {children}
      </div>
      <div data-rmiz-ghost style={styleGhost}>
        <button
          aria-label={`${a11yNameButtonZoom}: ${imgAlt}`}
          data-rmiz-btn-zoom
          onClick={handleOpen}
          type="button"
        >
          <IEnlarge />
        </button>
      </div>
      <dialog /* eslint-disable-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-redundant-roles */
        aria-labelledby={idModalImg}
        aria-modal="true"
        data-rmiz-modal
        ref={refDialog}
        onClick={handleClose}
        onClose={handleClose}
        onKeyDown={handleDialogKeyDown}
        role="dialog"
      >
        <div data-rmiz-modal-overlay={dataOverlayState} />
        <div data-rmiz-modal-content>
          {isImg || isDiv
            ? <img
              alt={imgAlt}
              sizes={imgSizes}
              src={imgSrc}
              srcSet={imgSrcSet}
              {...isZoomImgLoaded && modalState === ModalState.LOADED ? zoomImg : {}}
              data-rmiz-modal-img
              height={styleModalImg.height}
              id={idModalImg}
              ref={refModalImg}
              style={styleModalImg}
              width={styleModalImg.width}
            />
            : undefined
          }
          {isSvg
            ? <div
            data-rmiz-modal-img
            ref={refModalImg}
            style={styleModalImg}
            />
            : undefined
          }
          <button
            aria-label={a11yNameButtonUnzoom}
            data-rmiz-btn-unzoom
            onClick={handleClose}
            type="button"
          >
            <ICompress />
          </button>
        </div>
      </dialog>
    </div>
  )
}
