'use client';
import {createBrowserList} from './browser-list-store';
import {normalizeCart} from './cart-core';
import {normalizeFavoriteIds} from './favorite-ids';

export const cartStore=createBrowserList('pope-cart',normalizeCart);
export const favoritesStore=createBrowserList('pope-favorites',normalizeFavoriteIds);

export function toggleFavorite(id:string){
 const ids=favoritesStore.getSnapshot();
 favoritesStore.write(ids.includes(id)?ids.filter(saved=>saved!==id):[...ids,id]);
}
